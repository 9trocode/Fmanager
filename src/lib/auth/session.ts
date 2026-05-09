import "server-only";
import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { hostDb, schema } from "@/lib/db";

/**
 * Auth + admin-configuration setting keys live on the HOST DB always,
 * regardless of the active tenant context. Tenant DBs have their own
 * settings table for per-tenant base currency / AI keys, but these
 * keys are about the host instance itself.
 */
type HostSettingKey =
  | "admin_email"
  | "admin_name"
  | "admin_password_hash"
  | "registration_mode";

async function getHostSetting(key: HostSettingKey): Promise<string | null> {
  const row = await hostDb
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return row[0]?.value ?? null;
}

async function setHostSetting(key: HostSettingKey, value: string | null) {
  if (value == null || value === "") {
    await hostDb.delete(schema.settings).where(eq(schema.settings.key, key));
    return;
  }
  await hostDb
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date().toISOString() },
    });
}

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const COOKIE_NAME = "ff_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type Role = "admin" | "viewer";

function getSecret(): string {
  return (
    process.env.SESSION_SECRET ??
    process.env.ADMIN_PASSWORD ??
    "dev-only-insecure-secret-change-me"
  );
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

function pack(role: Role, expiresAt: number, userId: number | null): string {
  // userId is encoded as a string ("0" for the implicit settings-admin).
  const uid = userId == null ? "0" : String(userId);
  const payload = `${role}.${uid}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

type Unpacked = { role: Role; userId: number | null; expiresAt: number };

function safeEqHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function unpack(token: string): Unpacked | null {
  const parts = token.split(".");
  // Newest format: role.userId.expiresAt.mac (4 parts)
  if (parts.length === 4) {
    const [role, userIdStr, expiresAtStr, mac] = parts;
    if (role !== "admin" && role !== "viewer") return null;
    if (!userIdStr || !expiresAtStr || !mac) return null;
    const payload = `${role}.${userIdStr}.${expiresAtStr}`;
    if (!safeEqHex(mac, sign(payload))) return null;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    const userIdNum = Number(userIdStr);
    const userId = Number.isFinite(userIdNum) && userIdNum > 0 ? userIdNum : null;
    return { role: role as Role, userId, expiresAt };
  }
  // Old format: role.expiresAt.mac (3 parts) — implicit settings-admin.
  if (parts.length === 3) {
    const [role, expiresAtStr, mac] = parts;
    if (role !== "admin" && role !== "viewer") return null;
    if (!expiresAtStr || !mac) return null;
    const payload = `${role}.${expiresAtStr}`;
    if (!safeEqHex(mac, sign(payload))) return null;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return { role: role as Role, userId: null, expiresAt };
  }
  // Legacy format: expiresAt.mac (2 parts) — treat as admin (back-compat).
  if (parts.length === 2) {
    const [expiresAtStr, mac] = parts;
    if (!expiresAtStr || !mac) return null;
    if (!safeEqHex(mac, sign(expiresAtStr))) return null;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return { role: "admin", userId: null, expiresAt };
  }
  return null;
}

// ─── password hashing ────────────────────────────────────────────────────────

const HASH_KEYLEN = 64;
const HASH_SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(HASH_SALT_BYTES);
  const derived = await scrypt(password, salt, HASH_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPasswordHash(
  password: string,
  hash: string,
): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltHex, derivedHex] = parts;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(derivedHex, "hex");
  } catch {
    return false;
  }
  const derived = await scrypt(password, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function constantTimeStringEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ─── admin configuration state ───────────────────────────────────────────────

/**
 * True when an admin can be authenticated. Either:
 *  - DB has a stored admin_password_hash, OR
 *  - env ADMIN_PASSWORD is set (legacy / break-glass).
 */
export async function isAdminConfigured(): Promise<boolean> {
  if (process.env.ADMIN_PASSWORD) return true;
  const hash = await getHostSetting("admin_password_hash");
  return Boolean(hash);
}

export type AdminProfile = {
  email: string | null;
  name: string | null;
};

export async function getAdminProfile(): Promise<AdminProfile> {
  const [email, name] = await Promise.all([
    getHostSetting("admin_email"),
    getHostSetting("admin_name"),
  ]);
  return { email, name };
}

export type SetupAdminInput = {
  email: string;
  name?: string | null;
  password: string;
};

export async function setupAdminAccount(input: SetupAdminInput): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid email.");
  }
  if (!input.password || input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const hash = await hashPassword(input.password);
  await setHostSetting("admin_email", email);
  await setHostSetting("admin_name", input.name?.trim() || null);
  await setHostSetting("admin_password_hash", hash);
}

// ─── credential verification ─────────────────────────────────────────────────

export type LoginInput = { email?: string | null; password: string };

export type AuthResult = { role: Role; userId: number | null };

/**
 * Returns the matching role + user id, or null on failure.
 *
 * Auth source order:
 *   1. `users` table (email + password). Each row carries its own role.
 *   2. DB-stored settings admin (email + password) — the original owner.
 *      `userId` is null in this case (it's the implicit settings admin).
 *   3. env ADMIN_PASSWORD as a fallback (matches by password only).
 *   4. env VIEWER_PASSWORD for the read-only viewer role.
 *
 * In dev mode (no env passwords AND no DB admin) anything matches as admin.
 */
export async function verifyCredentials(
  input: LoginInput,
): Promise<AuthResult | null> {
  const password = input.password;
  const inputEmail = input.email?.trim().toLowerCase() ?? "";

  // 1. users table — covers invited members + future migrated admins.
  if (inputEmail) {
    const rows = await hostDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, inputEmail))
      .limit(1);
    const u = rows[0];
    if (u && (await verifyPasswordHash(password, u.passwordHash))) {
      return { role: u.role, userId: u.id };
    }
  }

  // 2. settings-based admin — the original owner.
  const dbHash = await getHostSetting("admin_password_hash");
  const dbEmail = (await getHostSetting("admin_email")) ?? "";

  if (dbHash) {
    if (
      inputEmail &&
      dbEmail &&
      constantTimeStringEq(inputEmail, dbEmail) &&
      (await verifyPasswordHash(password, dbHash))
    ) {
      return { role: "admin", userId: null };
    }
    // Fall through to viewer check; do NOT fall back to env ADMIN_PASSWORD
    // when DB has admin set — DB is canonical at that point.
  } else {
    const envAdmin = process.env.ADMIN_PASSWORD ?? "";
    if (envAdmin) {
      if (constantTimeStringEq(password, envAdmin)) {
        return { role: "admin", userId: null };
      }
    } else {
      // No DB admin and no env admin → dev mode, anything is admin.
      return { role: "admin", userId: null };
    }
  }

  const viewer = process.env.VIEWER_PASSWORD ?? "";
  if (viewer && constantTimeStringEq(password, viewer)) {
    return { role: "viewer", userId: null };
  }

  return null;
}

// ─── session lifecycle ───────────────────────────────────────────────────────

export async function createSession(
  role: Role,
  userId: number | null = null,
) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const jar = await cookies();
  jar.set(COOKIE_NAME, pack(role, expiresAt, userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/** True only when a configured admin exists AND a valid session cookie is present. */
export async function isAuthenticated(): Promise<boolean> {
  if (!(await isAdminConfigured())) return true; // dev mode passthrough
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return unpack(token) !== null;
}

/**
 * Returns the active role, or null if unauthenticated.
 * In dev (no admin configured) returns "admin" so the dev experience is unchanged.
 */
export async function getRole(): Promise<Role | null> {
  if (!(await isAdminConfigured())) return "admin";
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const unpacked = unpack(token);
  return unpacked ? unpacked.role : null;
}

export async function isAdmin(): Promise<boolean> {
  return (await getRole()) === "admin";
}

export async function isViewer(): Promise<boolean> {
  return (await getRole()) === "viewer";
}

/**
 * The active user row, when the session belongs to a user from the
 * `users` table. Returns null for the implicit settings-admin and
 * for env-based viewer/admin sessions.
 */
export async function getCurrentUser() {
  if (!(await isAdminConfigured())) return null;
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const unpacked = unpack(token);
  if (!unpacked || unpacked.userId == null) return null;
  const rows = await hostDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, unpacked.userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The active tenant id for the current request — null for the host
 * session (settings-admin or shared-scope user), or a user id for an
 * isolated-scope user. Used to bind the AsyncLocalStorage tenant
 * context at the layout / route boundary.
 */
export async function getActiveTenantId(): Promise<number | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return user.dataScope === "isolated" ? user.id : null;
}

/** Throws if the caller is not admin. Use at the top of mutation server actions. */
export async function assertAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") {
    throw new Error("Read-only access — admin required.");
  }
}

/** Legacy alias kept so older callers that imported `authDisabled` still build. */
export function authDisabled(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

/**
 * Backwards-compat password-only verify. Used only by code paths that
 * haven't been migrated to `verifyCredentials`. Prefer the new API.
 */
export async function verifyPassword(input: string): Promise<Role | null> {
  const result = await verifyCredentials({ password: input });
  return result?.role ?? null;
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  return unpack(token) !== null;
}

export const SESSION_COOKIE = COOKIE_NAME;
