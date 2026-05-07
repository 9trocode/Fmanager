"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { accountTypes } from "@/lib/db/schema";
import { assertAdmin } from "@/lib/auth/session";
import { localToday } from "@/lib/dates";

function revalidate(path?: string) {
  if (path) revalidatePath(path);
  revalidatePath("/", "layout");
  revalidatePath("/accounts");
}

function parseAccountType(value: FormDataEntryValue | null) {
  const v = String(value ?? "");
  if (!accountTypes.includes(v as (typeof accountTypes)[number])) {
    throw new Error(`Invalid account type: ${v}`);
  }
  return v as (typeof accountTypes)[number];
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error("Invalid number.");
  return n;
}

function parseDetailFields(formData: FormData) {
  return {
    accountNumber:
      String(formData.get("account_number") ?? "").trim() || null,
    routingOrIban:
      String(formData.get("routing_or_iban") ?? "").trim() || null,
    swiftBic: String(formData.get("swift_bic") ?? "").trim() || null,
    holderName: String(formData.get("holder_name") ?? "").trim() || null,
    branch: String(formData.get("branch") ?? "").trim() || null,
    loginUrl: String(formData.get("login_url") ?? "").trim() || null,
    contactPhone: String(formData.get("contact_phone") ?? "").trim() || null,
    statementsUrl:
      String(formData.get("statements_url") ?? "").trim() || null,
  };
}

export async function createAccount(formData: FormData) {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required.");
  const type = parseAccountType(formData.get("type"));
  const currency = String(formData.get("currency") ?? "USD").toUpperCase();
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const openingBalance = parseAmount(formData.get("opening_balance"));
  const asOf =
    String(formData.get("as_of") ?? "").trim() ||
    localToday();
  const details = parseDetailFields(formData);

  const [created] = await db
    .insert(schema.accounts)
    .values({ name, type, currency, institution, notes, ...details })
    .returning();

  if (created) {
    await db.insert(schema.valueSnapshots).values({
      accountId: created.id,
      value: openingBalance,
      currency,
      asOf,
      source: "manual",
    });
  }

  revalidate();
}

export async function updateAccount(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required.");
  const type = parseAccountType(formData.get("type"));
  const currency = String(formData.get("currency") ?? "USD").toUpperCase();
  const institution = String(formData.get("institution") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const details = parseDetailFields(formData);

  await db
    .update(schema.accounts)
    .set({
      name,
      type,
      currency,
      institution,
      notes,
      ...details,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(schema.accounts.id, id));

  revalidate(`/accounts/${id}`);
}

export async function archiveAccount(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db
    .update(schema.accounts)
    .set({ archived: true, updatedAt: new Date().toISOString() })
    .where(eq(schema.accounts.id, id));
  revalidate();
  redirect("/accounts");
}

export async function unarchiveAccount(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db
    .update(schema.accounts)
    .set({ archived: false, updatedAt: new Date().toISOString() })
    .where(eq(schema.accounts.id, id));
  revalidate(`/accounts/${id}`);
}

export async function deleteAccount(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
  revalidate();
  redirect("/accounts");
}

export async function addSnapshot(formData: FormData) {
  await assertAdmin();
  const accountId = Number(formData.get("account_id"));
  if (!Number.isFinite(accountId)) throw new Error("Invalid account id.");
  const value = parseAmount(formData.get("value"));
  const currency = String(formData.get("currency") ?? "USD").toUpperCase();
  const asOf =
    String(formData.get("as_of") ?? "").trim() ||
    localToday();

  await db.insert(schema.valueSnapshots).values({
    accountId,
    value,
    currency,
    asOf,
    source: "manual",
  });
  revalidate(`/accounts/${accountId}`);
}

export async function deleteSnapshot(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  const accountId = Number(formData.get("account_id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  await db.delete(schema.valueSnapshots).where(eq(schema.valueSnapshots.id, id));
  revalidate(Number.isFinite(accountId) ? `/accounts/${accountId}` : undefined);
}
