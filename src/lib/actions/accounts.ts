"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { accountTypes } from "@/lib/db/schema";
import { assertAdmin } from "@/lib/auth/session";
import { getOwner, ownedBy } from "@/lib/db/scope";
import { isValidYmdOnOrBefore, localToday } from "@/lib/dates";
import { SUPPORTED_CURRENCIES } from "@/lib/format";

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

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  const n = parseOptionalNumber(value);
  return n != null ? Math.round(n) : null;
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
    // Loan-only — null on every other account type. Form should only
    // submit these when the type is "loan", but we accept them
    // unconditionally; they're harmless for non-loans.
    interestRatePct: parseOptionalNumber(formData.get("interest_rate_pct")),
    originalPrincipal: parseOptionalNumber(
      formData.get("original_principal"),
    ),
    loanTermMonths: parseOptionalInt(formData.get("loan_term_months")),
    paymentDayOfMonth: parseOptionalInt(formData.get("payment_day_of_month")),
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
  const today = localToday();
  const asOf = String(formData.get("as_of") ?? "").trim() || today;
  if (!isValidYmdOnOrBefore(asOf, today)) {
    throw new Error("As-of date must be today or earlier.");
  }
  if (type === "investment") {
    if (openingBalance < 0) {
      throw new Error("Investment value cannot be negative.");
    }
    if (
      !SUPPORTED_CURRENCIES.includes(
        currency as (typeof SUPPORTED_CURRENCIES)[number],
      )
    ) {
      throw new Error(`Unsupported investment currency: ${currency}`);
    }
  }
  const details = parseDetailFields(formData);

  const owner = await getOwner();
  db.transaction((tx) => {
    const created = tx
      .insert(schema.accounts)
      .values({
        name,
        type,
        currency,
        institution,
        notes,
        ...details,
        ownerUserId: owner,
      })
      .returning()
      .get();
    if (!created) throw new Error("Account creation failed.");

    tx.insert(schema.valueSnapshots)
      .values({
        accountId: created.id,
        value: openingBalance,
        currency,
        asOf,
        source: "manual",
        ownerUserId: owner,
      })
      .run();
  });

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
  const owner = await getOwner();

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
    .where(
      and(
        eq(schema.accounts.id, id),
        ownedBy(schema.accounts.ownerUserId, owner),
      ),
    );

  revalidate(`/accounts/${id}`);
}

export async function archiveAccount(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const owner = await getOwner();
  await db
    .update(schema.accounts)
    .set({ archived: true, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.accounts.id, id),
        ownedBy(schema.accounts.ownerUserId, owner),
      ),
    );
  revalidate();
  redirect("/accounts");
}

export async function unarchiveAccount(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const owner = await getOwner();
  await db
    .update(schema.accounts)
    .set({ archived: false, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.accounts.id, id),
        ownedBy(schema.accounts.ownerUserId, owner),
      ),
    );
  revalidate(`/accounts/${id}`);
}

export async function deleteAccount(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const owner = await getOwner();
  await db
    .delete(schema.accounts)
    .where(
      and(
        eq(schema.accounts.id, id),
        ownedBy(schema.accounts.ownerUserId, owner),
      ),
    );
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
  const owner = await getOwner();

  await db.insert(schema.valueSnapshots).values({
    accountId,
    value,
    currency,
    asOf,
    source: "manual",
    ownerUserId: owner,
  });
  revalidate(`/accounts/${accountId}`);
}

export async function updateSnapshot(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  const accountId = Number(formData.get("account_id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const value = parseAmount(formData.get("value"));
  const asOf = String(formData.get("as_of") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("Invalid date.");
  const owner = await getOwner();
  await db
    .update(schema.valueSnapshots)
    .set({ value, asOf })
    .where(
      and(
        eq(schema.valueSnapshots.id, id),
        ownedBy(schema.valueSnapshots.ownerUserId, owner),
      ),
    );
  revalidate(Number.isFinite(accountId) ? `/accounts/${accountId}` : undefined);
}

export async function deleteSnapshot(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  const accountId = Number(formData.get("account_id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const owner = await getOwner();
  await db
    .delete(schema.valueSnapshots)
    .where(
      and(
        eq(schema.valueSnapshots.id, id),
        ownedBy(schema.valueSnapshots.ownerUserId, owner),
      ),
    );
  revalidate(Number.isFinite(accountId) ? `/accounts/${accountId}` : undefined);
}
