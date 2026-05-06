"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";

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

function commonFields(formData: FormData) {
  const category = String(formData.get("category") ?? "").trim();
  if (!category) throw new Error("Category is required.");
  return {
    category,
    monthlyLimit: parseAmount(formData.get("monthlyLimit")),
    currency: String(formData.get("currency") ?? "USD")
      .trim()
      .toUpperCase(),
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createBudget(formData: FormData) {
  await assertAdmin();
  const fields = commonFields(formData);
  await db.insert(schema.budgets).values(fields);
  revalidate();
}

export async function updateBudget(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const fields = commonFields(formData);
  await db
    .update(schema.budgets)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(eq(schema.budgets.id, id));
  revalidate();
}

export async function deleteBudget(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db.delete(schema.budgets).where(eq(schema.budgets.id, id));
  revalidate();
}
