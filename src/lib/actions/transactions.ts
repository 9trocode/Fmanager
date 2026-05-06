"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { transactionKinds } from "@/lib/db/schema";
import { assertAdmin } from "@/lib/auth/session";

function revalidate(accountId?: number) {
  revalidatePath("/", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  if (accountId != null) revalidatePath(`/accounts/${accountId}`);
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  return n;
}

function parseKind(value: FormDataEntryValue | null) {
  const v = String(value ?? "");
  if (!transactionKinds.includes(v as (typeof transactionKinds)[number])) {
    throw new Error(`Invalid transaction kind: ${v}`);
  }
  return v as (typeof transactionKinds)[number];
}

function parseAccountId(
  value: FormDataEntryValue | null,
  field = "account_id",
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${field}.`);
  return n;
}

function parseOptionalAccountId(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseOptionalFlowId(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function commonFields(formData: FormData) {
  const kind = parseKind(formData.get("kind"));
  const accountId = parseAccountId(formData.get("account_id"));
  const destAccountId =
    kind === "transfer"
      ? parseOptionalAccountId(formData.get("dest_account_id"))
      : null;

  if (kind === "transfer") {
    if (destAccountId == null) {
      throw new Error("Destination account is required for transfers.");
    }
    if (destAccountId === accountId) {
      throw new Error("Source and destination accounts must differ.");
    }
  }

  const amount = parseAmount(formData.get("amount"));
  const currency = String(formData.get("currency") ?? "USD")
    .toUpperCase()
    .trim();
  if (!currency) throw new Error("Currency is required.");

  const occurredAt =
    String(formData.get("occurred_at") ?? "").trim() ||
    new Date().toISOString().slice(0, 10);

  const category = String(formData.get("category") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const flowId = parseOptionalFlowId(formData.get("flow_id"));

  return {
    accountId,
    destAccountId,
    kind,
    amount,
    currency,
    category,
    occurredAt,
    notes,
    flowId,
  };
}

export async function createTransaction(formData: FormData) {
  await assertAdmin();
  const fields = commonFields(formData);
  await db.insert(schema.transactions).values(fields);
  revalidate(fields.accountId);
}

export async function updateTransaction(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const fields = commonFields(formData);
  await db
    .update(schema.transactions)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(eq(schema.transactions.id, id));
  revalidate(fields.accountId);
}

export async function deleteTransaction(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  // Read the row first so we can target revalidation precisely.
  const existing = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .limit(1);
  await db.delete(schema.transactions).where(eq(schema.transactions.id, id));
  revalidate(existing[0]?.accountId);
}
