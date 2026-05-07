"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { localToday } from "@/lib/dates";

function revalidate(id?: number) {
  revalidatePath("/savings");
  revalidatePath("/", "layout");
  if (id != null) revalidatePath(`/savings/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/projections");
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid amount.");
  return n;
}

function parseOptionalAmount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseInt32(value: FormDataEntryValue | null, fallback: number): number {
  const n = Math.floor(Number(String(value ?? "")));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? n : null;
}

const VALID_KINDS = new Set(["savings", "net_worth", "fire", "debt_payoff"]);

function parseKind(
  value: FormDataEntryValue | null,
): "savings" | "net_worth" | "fire" | "debt_payoff" {
  const v = String(value ?? "savings");
  return VALID_KINDS.has(v)
    ? (v as "savings" | "net_worth" | "fire" | "debt_payoff")
    : "savings";
}

function commonFields(formData: FormData) {
  const startedAt =
    String(formData.get("started_at") ?? "").trim() ||
    localToday();
  return {
    kind: parseKind(formData.get("kind")),
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim() || null,
    targetAmount: parseOptionalAmount(formData.get("target_amount")),
    currentAmount: parseAmount(formData.get("current_amount")),
    currency: String(formData.get("currency") ?? "USD").toUpperCase(),
    monthlyContribution: parseAmount(formData.get("monthly_contribution")),
    expectedReturnPct: parseAmount(formData.get("expected_return_pct")),
    horizonMonths: parseInt32(formData.get("horizon_months"), 12),
    targetDate: String(formData.get("target_date") ?? "").trim() || null,
    fireMultiplier: parseOptionalAmount(formData.get("fire_multiplier")),
    startedAt,
    accountId: parseOptionalInt(formData.get("account_id")),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createSavingsGoal(formData: FormData) {
  await assertAdmin();
  const fields = commonFields(formData);
  if (!fields.name) throw new Error("Name is required.");
  if (fields.horizonMonths <= 0) throw new Error("Horizon must be > 0 months.");
  await db.insert(schema.savingsGoals).values(fields);
  revalidate();
}

export async function updateSavingsGoal(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const fields = commonFields(formData);
  if (!fields.name) throw new Error("Name is required.");
  await db
    .update(schema.savingsGoals)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(eq(schema.savingsGoals.id, id));
  revalidate(id);
}

export async function archiveSavingsGoal(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db
    .update(schema.savingsGoals)
    .set({ archived: true, updatedAt: new Date().toISOString() })
    .where(eq(schema.savingsGoals.id, id));
  revalidate(id);
}

export async function unarchiveSavingsGoal(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db
    .update(schema.savingsGoals)
    .set({ archived: false, updatedAt: new Date().toISOString() })
    .where(eq(schema.savingsGoals.id, id));
  revalidate(id);
}

export async function deleteSavingsGoal(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db.delete(schema.savingsGoals).where(eq(schema.savingsGoals.id, id));
  revalidate();
  redirect("/savings");
}
