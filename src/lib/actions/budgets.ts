"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { getOwner, ownedBy } from "@/lib/db/scope";

function revalidate() {
  revalidatePath("/", "layout");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid monthly limit.");
  return n;
}

function parseAccountId(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "any") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function commonFields(formData: FormData) {
  const category = String(formData.get("category") ?? "").trim();
  if (!category) throw new Error("Category is required.");
  return {
    category,
    monthlyLimit: parseAmount(formData.get("monthlyLimit")),
    currency: String(formData.get("currency") ?? "USD")
      .trim()
      .toUpperCase(),
    accountId: parseAccountId(formData.get("account_id")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

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

export async function createBudget(formData: FormData) {
  await assertAdmin();
  const fields = commonFields(formData);
  const owner = await getOwner();

  // When the user is filtered to a FUTURE month and creates a new
  // budget, stamp `effective_from` with that month so the budget
  // stays invisible to earlier months. Without this, a new budget
  // added on the August view would also appear in May's tracking
  // — counting commitments the user hasn't actually made yet.
  const scoped = parseMonthKey(formData.get("month_key"));
  const effectiveFrom =
    scoped != null && scoped > currentMonthKey() ? scoped : null;

  await db.insert(schema.budgets).values({
    ...fields,
    effectiveFrom,
    ownerUserId: owner,
  });
  revalidate();
}

export async function updateBudget(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const fields = commonFields(formData);
  const owner = await getOwner();

  // Month-scoped edit: when the user edits a budget while filtered
  // to a FUTURE month, only the monthly cap / currency for that
  // month should change. Category, account scope, and notes are not
  // meaningfully per-month, so we ignore the scope for those.
  const scoped = parseMonthKey(formData.get("month_key"));
  const isFutureEdit = scoped != null && scoped > currentMonthKey();

  if (isFutureEdit) {
    const nowIso = new Date().toISOString();
    await db
      .insert(schema.budgetOverrides)
      .values({
        budgetId: id,
        monthKey: scoped,
        monthlyLimit: fields.monthlyLimit,
        currency: fields.currency,
        ownerUserId: owner,
      })
      .onConflictDoUpdate({
        target: [
          schema.budgetOverrides.budgetId,
          schema.budgetOverrides.monthKey,
        ],
        set: {
          monthlyLimit: fields.monthlyLimit,
          currency: fields.currency,
          updatedAt: nowIso,
        },
      });
    revalidate();
    return;
  }

  await db
    .update(schema.budgets)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(
      and(eq(schema.budgets.id, id), ownedBy(schema.budgets.ownerUserId, owner)),
    );
  revalidate();
}

export async function deleteBudget(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const owner = await getOwner();
  await db
    .delete(schema.budgets)
    .where(
      and(eq(schema.budgets.id, id), ownedBy(schema.budgets.ownerUserId, owner)),
    );
  revalidate();
}
