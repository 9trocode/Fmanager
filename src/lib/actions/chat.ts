"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { getOwner, ownedBy } from "@/lib/db/scope";

/**
 * Server-side persistence for advisor chat sessions and messages.
 *
 * Each session is a separate thread (sidebar entry on /advisor). Messages
 * are stored as the full v6 UIMessage JSON so text/file/tool-call parts
 * round-trip without per-part column gymnastics. Title is auto-derived
 * from the first user message but can be edited later.
 */

export type ChatSessionRow = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export async function listChatSessions(): Promise<ChatSessionRow[]> {
  await assertAdmin();
  const owner = await getOwner();
  return db
    .select()
    .from(schema.chatSessions)
    .where(ownedBy(schema.chatSessions.ownerUserId, owner))
    .orderBy(desc(schema.chatSessions.updatedAt));
}

export async function getChatSession(
  sessionId: number,
): Promise<{ session: ChatSessionRow; messages: UIMessage[] } | null> {
  await assertAdmin();
  const owner = await getOwner();
  const [session] = await db
    .select()
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        ownedBy(schema.chatSessions.ownerUserId, owner),
      ),
    )
    .limit(1);
  if (!session) return null;
  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, sessionId))
    .orderBy(asc(schema.chatMessages.createdAt), asc(schema.chatMessages.id));
  const messages = rows
    .map((r) => {
      try {
        return JSON.parse(r.uiJson) as UIMessage;
      } catch {
        return null;
      }
    })
    .filter((m): m is UIMessage => m != null);
  return { session, messages };
}

export async function createChatSession(): Promise<number> {
  await assertAdmin();
  const owner = await getOwner();
  const [row] = await db
    .insert(schema.chatSessions)
    .values({ title: "New conversation", ownerUserId: owner })
    .returning();
  revalidatePath("/advisor");
  return row.id;
}

export async function deleteChatSession(sessionId: number): Promise<void> {
  await assertAdmin();
  const owner = await getOwner();
  await db
    .delete(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        ownedBy(schema.chatSessions.ownerUserId, owner),
      ),
    );
  revalidatePath("/advisor");
}

export async function renameChatSession(
  sessionId: number,
  title: string,
): Promise<void> {
  await assertAdmin();
  const trimmed = title.trim().slice(0, 80) || "Untitled";
  const owner = await getOwner();
  await db
    .update(schema.chatSessions)
    .set({ title: trimmed, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        ownedBy(schema.chatSessions.ownerUserId, owner),
      ),
    );
  revalidatePath("/advisor");
}

/**
 * Idempotent upsert by `clientId`. The chat API route calls this on
 * every request to persist freshly streamed messages — we want
 * "send same message twice" to overwrite, not duplicate. The full
 * UIMessage JSON is stored verbatim; structured parts come back out on
 * page reload as the same message.
 */
export async function upsertChatMessage(
  sessionId: number,
  msg: UIMessage,
): Promise<void> {
  await assertAdmin();
  const owner = await getOwner();
  // Confirm the session belongs to the active owner before writing.
  const [session] = await db
    .select()
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        ownedBy(schema.chatSessions.ownerUserId, owner),
      ),
    )
    .limit(1);
  if (!session) return;
  const uiJson = JSON.stringify(msg);
  const existing = await db
    .select()
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, sessionId),
        eq(schema.chatMessages.clientId, msg.id),
      ),
    )
    .limit(1);
  if (existing[0]) {
    await db
      .update(schema.chatMessages)
      .set({ uiJson, role: msg.role })
      .where(eq(schema.chatMessages.id, existing[0].id));
  } else {
    await db.insert(schema.chatMessages).values({
      sessionId,
      clientId: msg.id,
      role: msg.role,
      uiJson,
    });
  }
  await db
    .update(schema.chatSessions)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(schema.chatSessions.id, sessionId));
}

/**
 * Auto-title from the first user message, when the session still has
 * the placeholder title. Trims to 60 chars and strips line breaks.
 */
export async function maybeAutoTitle(
  sessionId: number,
  userText: string,
): Promise<void> {
  if (!userText.trim()) return;
  const owner = await getOwner();
  const [session] = await db
    .select()
    .from(schema.chatSessions)
    .where(
      and(
        eq(schema.chatSessions.id, sessionId),
        ownedBy(schema.chatSessions.ownerUserId, owner),
      ),
    )
    .limit(1);
  if (!session) return;
  if (session.title !== "New conversation") return;
  const candidate = userText.replace(/\s+/g, " ").trim().slice(0, 60);
  await db
    .update(schema.chatSessions)
    .set({ title: candidate, updatedAt: new Date().toISOString() })
    .where(eq(schema.chatSessions.id, sessionId));
}
