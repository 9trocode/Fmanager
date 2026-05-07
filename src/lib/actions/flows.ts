"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { flowCadences, flowKinds } from "@/lib/db/schema";
import { assertAdmin } from "@/lib/auth/session";
import { localToday } from "@/lib/dates";

function revalidate() {
  revalidatePath("/", "layout");
  revalidatePath("/cash-flow");
  revalidatePath("/dashboard");
  revalidatePath("/projections");
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid amount.");
  return n;
}

function parseKind(value: FormDataEntryValue | null) {
  const v = String(value ?? "");
  if (!flowKinds.includes(v as (typeof flowKinds)[number])) {
    throw new Error(`Invalid kind: ${v}`);
  }
  return v as (typeof flowKinds)[number];
}

function parseCadence(value: FormDataEntryValue | null) {
  const v = String(value ?? "monthly");
  if (!flowCadences.includes(v as (typeof flowCadences)[number])) {
    throw new Error(`Invalid cadence: ${v}`);
  }
  return v as (typeof flowCadences)[number];
}

function parseAccountId(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "none") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function commonFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    kind: parseKind(formData.get("kind")),
    category: String(formData.get("category") ?? "").trim() || null,
    amount: parseAmount(formData.get("amount")),
    currency: String(formData.get("currency") ?? "USD").toUpperCase(),
    cadence: parseCadence(formData.get("cadence")),
    accountId: parseAccountId(formData.get("account_id")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createFlow(formData: FormData) {
  await assertAdmin();
  const fields = commonFields(formData);
  if (!fields.name) throw new Error("Name is required.");

  // Insert the flow itself.
  const today = localToday();
  const [flow] = await db
    .insert(schema.recurringFlows)
    .values({ ...fields, lastPostedAt: today })
    .returning();

  // Post the first transaction immediately so the user sees the flow
  // affect their balances and budgets right away — it matches the user's
  // mental model ("I'm getting paid this month / paying rent this
  // month"). Subsequent accruals fire one full cadence later via
  // `accrueDueFlows()`.
  //
  // Skipped if no account is linked (the transaction would have nowhere
  // to land) — the auto-accruer also requires an account.
  if (flow.accountId != null) {
    await db.insert(schema.transactions).values({
      kind: flow.kind,
      amount: flow.amount,
      currency: flow.currency,
      accountId: flow.accountId,
      occurredAt: today,
      category: flow.category,
      flowId: flow.id,
      notes: flow.notes ?? `Auto-posted from ${flow.name}`,
    });
  }
  revalidate();
}

export async function updateFlow(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const fields = commonFields(formData);
  if (!fields.name) throw new Error("Name is required.");
  await db
    .update(schema.recurringFlows)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(eq(schema.recurringFlows.id, id));
  revalidate();
}

export async function deleteFlow(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db.delete(schema.recurringFlows).where(eq(schema.recurringFlows.id, id));
  revalidate();
}

/**
 * Manually post a transaction for THIS period right now, without waiting
 * for the cadence to elapse. Used by the "Apply now" affordance on a
 * flow row — useful for existing flows that were created before the
 * auto-accrual feature shipped, or any time the user wants the current
 * period's transaction in their books immediately.
 *
 * Idempotent against same-day double-posts: if a transaction with this
 * flowId is already dated today, we no-op.
 */
export async function applyFlowNow(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");

  const [flow] = await db
    .select()
    .from(schema.recurringFlows)
    .where(eq(schema.recurringFlows.id, id))
    .limit(1);
  if (!flow) throw new Error("Flow not found.");
  if (flow.accountId == null) {
    throw new Error("Link this flow to an account before applying it.");
  }

  const today = localToday();

  // Same-day idempotency: if the user clicks "Apply now" twice in a
  // row, only post once.
  const existing = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.flowId, flow.id),
        eq(schema.transactions.occurredAt, today),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    revalidate();
    return;
  }

  await db.insert(schema.transactions).values({
    kind: flow.kind,
    amount: flow.amount,
    currency: flow.currency,
    accountId: flow.accountId,
    occurredAt: today,
    category: flow.category,
    flowId: flow.id,
    notes: flow.notes ?? `Manually applied from ${flow.name}`,
  });
  await db
    .update(schema.recurringFlows)
    .set({ lastPostedAt: today, updatedAt: new Date().toISOString() })
    .where(eq(schema.recurringFlows.id, flow.id));
  revalidate();
}

export async function toggleFlowArchived(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  const archived = String(formData.get("archived") ?? "false") === "true";
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db
    .update(schema.recurringFlows)
    .set({ archived: !archived, updatedAt: new Date().toISOString() })
    .where(eq(schema.recurringFlows.id, id));
  revalidate();
}
