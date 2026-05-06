import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

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

function pack(role: Role, expiresAt: number): string {
  const payload = `${role}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

type Unpacked = { role: Role; expiresAt: number };

function safeEqHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function unpack(token: string): Unpacked | null {
  const parts = token.split(".");
  // New format: role.expiresAt.mac (3 parts)
  if (parts.length === 3) {
    const [role, expiresAtStr, mac] = parts;
    if (role !== "admin" && role !== "viewer") return null;
    if (!expiresAtStr || !mac) return null;
    const payload = `${role}.${expiresAtStr}`;
    if (!safeEqHex(mac, sign(payload))) return null;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return { role: role as Role, expiresAt };
  }
  // Legacy format: expiresAt.mac (2 parts) — treat as admin (back-compat).
  if (parts.length === 2) {
    const [expiresAtStr, mac] = parts;
    if (!expiresAtStr || !mac) return null;
    if (!safeEqHex(mac, sign(expiresAtStr))) return null;
    const expiresAt = Number(expiresAtStr);
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
    return { role: "admin", expiresAt };
  }
  return null;
}

export function authDisabled(): boolean {
  return !process.env.ADMIN_PASSWORD;
}

function constantTimeStringEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Returns the role that the input password matches, or null.
 * - admin password → "admin"
 * - viewer password (if set) → "viewer"
 * - In dev (no ADMIN_PASSWORD) anything matches as admin.
 */
export function verifyPassword(input: string): Role | null {
  const admin = process.env.ADMIN_PASSWORD ?? "";
  if (!admin) return "admin"; // dev mode: auth disabled, treat all as admin
  if (constantTimeStringEq(input, admin)) return "admin";
  const viewer = process.env.VIEWER_PASSWORD ?? "";
  if (viewer && constantTimeStringEq(input, viewer)) return "viewer";
  return null;
}

export async function createSession(role: Role) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const jar = await cookies();
  jar.set(COOKIE_NAME, pack(role, expiresAt), {
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

export async function isAuthenticated(): Promise<boolean> {
  if (authDisabled()) return true;
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return unpack(token) !== null;
}

/**
 * Returns the active role, or null if unauthenticated.
 * In dev (auth disabled) this returns "admin" so the dev experience is unchanged.
 */
export async function getRole(): Promise<Role | null> {
  if (authDisabled()) return "admin";
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
 * Throws if the caller is not admin. Use at the top of mutation server actions.
 */
export async function assertAdmin(): Promise<void> {
  const role = await getRole();
  if (role !== "admin") {
    throw new Error("Read-only access — admin required.");
  }
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  return unpack(token) !== null;
}

export const SESSION_COOKIE = COOKIE_NAME;
