"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import type { PredictionMessageRole } from "@/lib/db/schema";

/**
 * Server-side persistence for /projections chat sessions.
 *
 * Schema-wise: prediction_sessions (one per thread) + prediction_messages
 * (append-only, one per turn). Each message stores its full ChatMessage
 * payload as JSON — including scenario blocks with proposedEdits and
 * per-block applied/saved flags. Blob serialization keeps the client
 * shape free to evolve without migrations.
 */

export type PredictionSessionRow = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type PredictionStoredMessage = {
  id: number;
  clientId: string;
  role: PredictionMessageRole;
  payload: unknown;
  createdAt: string;
};

export async function listPredictionSessions(): Promise<PredictionSessionRow[]> {
  await assertAdmin();
  return db
    .select()
    .from(schema.predictionSessions)
    .orderBy(desc(schema.predictionSessions.updatedAt));
}

export async function getPredictionSession(sessionId: number): Promise<{
  session: PredictionSessionRow;
  messages: PredictionStoredMessage[];
} | null> {
  await assertAdmin();
  const [session] = await db
    .select()
    .from(schema.predictionSessions)
    .where(eq(schema.predictionSessions.id, sessionId))
    .limit(1);
  if (!session) return null;
  const rows = await db
    .select()
    .from(schema.predictionMessages)
    .where(eq(schema.predictionMessages.sessionId, sessionId))
    .orderBy(
      asc(schema.predictionMessages.createdAt),
      asc(schema.predictionMessages.id),
    );
  const messages: PredictionStoredMessage[] = rows.map((r) => {
    let payload: unknown = null;
    try {
      payload = JSON.parse(r.payloadJson);
    } catch {
      payload = null;
    }
    return {
      id: r.id,
      clientId: r.clientId,
      role: r.role,
      payload,
      createdAt: r.createdAt,
    };
  });
  return { session, messages };
}

export async function createPredictionSession(): Promise<number> {
  await assertAdmin();
  const [row] = await db
    .insert(schema.predictionSessions)
    .values({ title: "New prediction" })
    .returning({ id: schema.predictionSessions.id });
  return row.id;
}

/**
 * Insert-or-update a message by (sessionId, clientId). The chat client
 * generates clientId once per turn; subsequent updates (e.g. flipping
 * a scenario block to applied=true) re-call this with the same
 * clientId so the row's payload swaps in place rather than appending.
 */
export async function upsertPredictionMessage(
  sessionId: number,
  msg: {
    clientId: string;
    role: PredictionMessageRole;
    payload: unknown;
  },
): Promise<void> {
  await assertAdmin();
  const existing = await db
    .select({ id: schema.predictionMessages.id })
    .from(schema.predictionMessages)
    .where(
      and(
        eq(schema.predictionMessages.sessionId, sessionId),
        eq(schema.predictionMessages.clientId, msg.clientId),
      ),
    )
    .limit(1);
  const payloadJson = JSON.stringify(msg.payload);
  if (existing[0]) {
    await db
      .update(schema.predictionMessages)
      .set({ payloadJson, role: msg.role })
      .where(eq(schema.predictionMessages.id, existing[0].id));
  } else {
    await db.insert(schema.predictionMessages).values({
      sessionId,
      clientId: msg.clientId,
      role: msg.role,
      payloadJson,
    });
  }
  // Bump the session's updatedAt so it sorts to the top of history.
  await db
    .update(schema.predictionSessions)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(schema.predictionSessions.id, sessionId));
}

/**
 * Title the session from the first user message, if it still has the
 * default. Fire-and-forget; never errors back to the caller.
 */
export async function maybeAutoTitlePredictionSession(
  sessionId: number,
  firstUserText: string,
): Promise<void> {
  await assertAdmin();
  const [session] = await db
    .select({ title: schema.predictionSessions.title })
    .from(schema.predictionSessions)
    .where(eq(schema.predictionSessions.id, sessionId))
    .limit(1);
  if (!session) return;
  if (session.title !== "New prediction") return;
  const trimmed = firstUserText.trim().split(/\s+/).slice(0, 8).join(" ");
  if (!trimmed) return;
  await db
    .update(schema.predictionSessions)
    .set({
      title: trimmed.slice(0, 80),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.predictionSessions.id, sessionId));
}

export async function deletePredictionSession(
  sessionId: number,
): Promise<void> {
  await assertAdmin();
  await db
    .delete(schema.predictionSessions)
    .where(eq(schema.predictionSessions.id, sessionId));
  revalidatePath("/projections");
}

export async function renamePredictionSession(
  sessionId: number,
  title: string,
): Promise<void> {
  await assertAdmin();
  const trimmed = title.trim().slice(0, 80);
  if (!trimmed) throw new Error("Title is required.");
  await db
    .update(schema.predictionSessions)
    .set({ title: trimmed, updatedAt: new Date().toISOString() })
    .where(eq(schema.predictionSessions.id, sessionId));
  revalidatePath("/projections");
}
