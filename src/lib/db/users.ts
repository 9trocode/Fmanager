import "server-only";
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, or, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { hashPassword } from "@/lib/auth/session";
import type { UserRole } from "@/lib/db/schema";

export type ListedUser = {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  createdAt: string;
};

export async function listUsers(): Promise<ListedUser[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt));
  return rows;
}

export async function findUserByEmail(email: string) {
  const e = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, e))
    .limit(1);
  return rows[0] ?? null;
}

export type CreateUserInput = {
  email: string;
  name?: string | null;
  password: string;
  role: UserRole;
};

export async function createUser(input: CreateUserInput) {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Enter a valid email.");
  }
  if (!input.password || input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error("An account with that email already exists.");
  }
  const hash = await hashPassword(input.password);
  const [row] = await db
    .insert(schema.users)
    .values({
      email,
      name: input.name?.trim() || null,
      passwordHash: hash,
      role: input.role,
    })
    .returning();
  return row;
}

export async function deleteUserById(id: number) {
  await db.delete(schema.users).where(eq(schema.users.id, id));
}

// ─── invites ─────────────────────────────────────────────────────────────────

export type ListedInvite = {
  id: number;
  code: string;
  email: string | null;
  role: UserRole;
  expiresAt: string | null;
  usedAt: string | null;
  usedByUserId: number | null;
  createdAt: string;
};

/**
 * Active = not used and not expired. Sorted newest-first.
 */
export async function listActiveInvites(): Promise<ListedInvite[]> {
  const nowIso = new Date().toISOString();
  const rows = await db
    .select()
    .from(schema.invites)
    .where(
      and(
        isNull(schema.invites.usedAt),
        or(isNull(schema.invites.expiresAt), gt(schema.invites.expiresAt, nowIso)),
      ),
    )
    .orderBy(desc(schema.invites.createdAt));
  return rows;
}

export type CreateInviteInput = {
  email?: string | null;
  role: UserRole;
  expiresInHours?: number | null;
};

function generateInviteCode(): string {
  // 16 random bytes → 32 hex chars, plenty for a one-time code.
  return randomBytes(16).toString("hex");
}

export async function createInvite(input: CreateInviteInput) {
  const expiresAt =
    input.expiresInHours && input.expiresInHours > 0
      ? new Date(Date.now() + input.expiresInHours * 3600_000).toISOString()
      : null;
  const [row] = await db
    .insert(schema.invites)
    .values({
      code: generateInviteCode(),
      email: input.email?.trim().toLowerCase() || null,
      role: input.role,
      expiresAt,
    })
    .returning();
  return row;
}

export async function revokeInvite(id: number) {
  await db.delete(schema.invites).where(eq(schema.invites.id, id));
}

/**
 * Look up an invite by its code. Returns null if missing, used, or expired.
 */
export async function findUsableInvite(code: string) {
  const c = code.trim();
  if (!c) return null;
  const rows = await db
    .select()
    .from(schema.invites)
    .where(eq(schema.invites.code, c))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date().toISOString()) return null;
  return row;
}

export async function markInviteUsed(inviteId: number, userId: number) {
  await db
    .update(schema.invites)
    .set({ usedAt: new Date().toISOString(), usedByUserId: userId })
    .where(eq(schema.invites.id, inviteId));
}
