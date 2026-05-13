"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { flowCadences, flowKinds } from "@/lib/db/schema";
import { assertAdmin } from "@/lib/auth/session";
import { getOwner, ownedBy } from "@/lib/db/scope";
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

function parseDate(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  // Accept the YYYY-MM-DD shape that <input type="date"> emits.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
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
    nextDueAt: parseDate(formData.get("next_due_at")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

/**
 * Returns the `YYYY-MM` of "right now" in local time. Used to decide
 * whether a month-scoped edit lands in the overrides table or on the
 * base flow row.
 */
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return raw;
}

export async function createFlow(formData: FormData) {
  await assertAdmin();
  const fields = commonFields(formData);
  if (!fields.name) throw new Error("Name is required.");

  const today = localToday();
  // If the user picked an explicit nextDueAt that's in the future, defer
  // posting — the accruer will fire on that date. If it's today or past
  // (or unset), post immediately so the flow shows up in balances now.
  const nextDueAt = fields.nextDueAt;
  const deferToFuture = nextDueAt != null && nextDueAt > today;

  // Seed lastPostedAt to today so the cadence-based fallback path doesn't
  // back-post months of history when nextDueAt is null and the user
  // skips immediate posting on a no-account flow.
  const owner = await getOwner();
  const [flow] = await db
    .insert(schema.recurringFlows)
    .values({ ...fields, lastPostedAt: today, ownerUserId: owner })
    .returning();

  // Post the first transaction immediately so the flow affects balances
  // right away. Skipped when:
  //   * no account is linked (auto-accruer also requires one), OR
  //   * an explicit nextDueAt is in the future — the user clearly wants
  //     the system to wait until that date.
  if (flow.accountId != null && !deferToFuture) {
    await db.insert(schema.transactions).values({
      kind: flow.kind,
      amount: flow.amount,
      currency: flow.currency,
      accountId: flow.accountId,
      occurredAt: nextDueAt ?? today,
      category: flow.category,
      flowId: flow.id,
      notes: flow.notes ?? `Auto-posted from ${flow.name}`,
      ownerUserId: owner,
    });
    if (nextDueAt) {
      const advanced = advanceCadence(nextDueAt, fields.cadence);
      await db
        .update(schema.recurringFlows)
        .set({ nextDueAt: advanced, updatedAt: new Date().toISOString() })
        .where(eq(schema.recurringFlows.id, flow.id));
    }
  }
  revalidate();
}

/**
 * Advance a `YYYY-MM-DD` string by one cadence period in local time.
 * Mirrors `flow-accrual.ts`'s addCadence — duplicated here to keep
 * the action layer free of cross-file imports for one helper.
 */
function advanceCadence(
  ymd: string,
  cadence: (typeof flowCadences)[number],
): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const next = new Date(y, m - 1, d);
  if (cadence === "weekly") next.setDate(next.getDate() + 7);
  else if (cadence === "yearly") next.setFullYear(next.getFullYear() + 1);
  else {
    const wantDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(wantDay, lastDay));
  }
  const yy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export async function updateFlow(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const fields = commonFields(formData);
  if (!fields.name) throw new Error("Name is required.");
  const owner = await getOwner();

  // Month-scoped edit: when the user edits a flow while the global
  // month filter is set to a FUTURE month, only the amount/currency
  // for that month should change. Everything else (name, category,
  // cadence, account, due date) is fundamentally not a per-month
  // thing, so we ignore the scope for those and still apply on the
  // base. We just diverge the amount via the overrides table.
  const scoped = parseMonthKey(formData.get("month_key"));
  const isFutureEdit = scoped != null && scoped > currentMonthKey();

  if (isFutureEdit) {
    const nowIso = new Date().toISOString();
    // Upsert the override row. SQLite ON CONFLICT on the unique
    // (flow_id, month_key) index → update amount/currency in place
    // so repeated edits don't accumulate rows.
    await db
      .insert(schema.recurringFlowOverrides)
      .values({
        flowId: id,
        monthKey: scoped,
        amount: fields.amount,
        currency: fields.currency,
        ownerUserId: owner,
      })
      .onConflictDoUpdate({
        target: [
          schema.recurringFlowOverrides.flowId,
          schema.recurringFlowOverrides.monthKey,
        ],
        set: {
          amount: fields.amount,
          currency: fields.currency,
          updatedAt: nowIso,
        },
      });
    revalidate();
    return;
  }

  // Default path: edit base flow as before.
  await db
    .update(schema.recurringFlows)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.recurringFlows.id, id),
        ownedBy(schema.recurringFlows.ownerUserId, owner),
      ),
    );
  revalidate();
}

export async function deleteFlow(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const owner = await getOwner();
  await db
    .delete(schema.recurringFlows)
    .where(
      and(
        eq(schema.recurringFlows.id, id),
        ownedBy(schema.recurringFlows.ownerUserId, owner),
      ),
    );
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

  const owner = await getOwner();
  const [flow] = await db
    .select()
    .from(schema.recurringFlows)
    .where(
      and(
        eq(schema.recurringFlows.id, id),
        ownedBy(schema.recurringFlows.ownerUserId, owner),
      ),
    )
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
    ownerUserId: owner,
  });
  // Advance nextDueAt PAST today so accrueDueFlows doesn't post a
  // second tx for the original anchored due date. Without this, a
  // user clicking Apply Now on the 5th for a salary anchored to the
  // 25th got two transactions per month (one dated 5th from this
  // action, one dated 25th from the auto-accruer) — different
  // occurred_at values, so the (flow_id, occurred_at) unique index
  // never caught it.
  let nextDueAt = flow.nextDueAt;
  if (nextDueAt) {
    let safety = 0;
    // Walk forward in cadence steps until we land strictly after
    // today. Handles the "applied a long-overdue flow" case where
    // the original nextDueAt is months stale.
    while (nextDueAt <= today && safety < 36) {
      nextDueAt = advanceCadence(nextDueAt, flow.cadence);
      safety += 1;
    }
  }
  await db
    .update(schema.recurringFlows)
    .set({
      lastPostedAt: today,
      ...(nextDueAt != null ? { nextDueAt } : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.recurringFlows.id, flow.id));
  revalidate();
}

export async function toggleFlowArchived(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  const archived = String(formData.get("archived") ?? "false") === "true";
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const owner = await getOwner();
  await db
    .update(schema.recurringFlows)
    .set({ archived: !archived, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.recurringFlows.id, id),
        ownedBy(schema.recurringFlows.ownerUserId, owner),
      ),
    );
  revalidate();
}
