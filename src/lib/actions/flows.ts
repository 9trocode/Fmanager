"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
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
  // Seed `lastPostedAt` to today so the first auto-accrual fires after
  // ONE full cadence has passed (a monthly salary added Feb 15 generates
  // its first transaction Mar 15, not Feb 15). Avoids surprise back-dated
  // posts at creation.
  await db
    .insert(schema.recurringFlows)
    .values({ ...fields, lastPostedAt: localToday() });
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
