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

export async function createBudget(formData: FormData) {
  await assertAdmin();
  const fields = commonFields(formData);
  const owner = await getOwner();
  await db.insert(schema.budgets).values({ ...fields, ownerUserId: owner });
  revalidate();
}

export async function updateBudget(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const fields = commonFields(formData);
  const owner = await getOwner();
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
