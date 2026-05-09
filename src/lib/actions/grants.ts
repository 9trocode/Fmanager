"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { getOwner, ownedBy } from "@/lib/db/scope";

const GRANT_TYPES = ["iso", "nso", "rsu", "founder_shares", "safe", "other"] as const;
type GrantType = (typeof GRANT_TYPES)[number];

function revalidate(id?: number) {
  revalidatePath("/equity");
  if (id != null) revalidatePath(`/equity/${id}`);
  revalidatePath("/", "layout");
}

function parseGrantType(value: FormDataEntryValue | null): GrantType {
  const v = String(value ?? "");
  if (!GRANT_TYPES.includes(v as GrantType)) {
    throw new Error(`Invalid grant type: ${v}`);
  }
  return v as GrantType;
}

function parseAmount(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error("Invalid number.");
  return n;
}

function parseOptionalAmount(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function parseOptionalInt(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? n : null;
}

function commonFields(formData: FormData) {
  return {
    company: String(formData.get("company") ?? "").trim(),
    grantType: parseGrantType(formData.get("grant_type")),
    totalShares: parseAmount(formData.get("total_shares")),
    vestedShares: parseAmount(formData.get("vested_shares")),
    strikePrice: parseOptionalAmount(formData.get("strike_price")),
    currency: String(formData.get("currency") ?? "USD").toUpperCase(),
    fmvPerShare: parseOptionalAmount(formData.get("fmv_per_share")),
    exitPricePerShare: parseOptionalAmount(formData.get("exit_price_per_share")),
    vestingStartDate: parseDate(formData.get("vesting_start_date")),
    vestingMonths: parseOptionalInt(formData.get("vesting_months")),
    cliffMonths: parseOptionalInt(formData.get("cliff_months")),
    expectedExitMonths: parseOptionalInt(formData.get("expected_exit_months")),
    taxRatePct: parseOptionalAmount(formData.get("tax_rate_pct")),
    grantedAt: parseDate(formData.get("granted_at")),
    vestingNotes: String(formData.get("vesting_notes") ?? "").trim() || null,
  };
}

export async function createGrant(formData: FormData) {
  await assertAdmin();
  const fields = commonFields(formData);
  if (!fields.company) throw new Error("Company is required.");
  if (fields.vestedShares > fields.totalShares) {
    throw new Error("Vested shares cannot exceed total shares.");
  }
  const owner = await getOwner();
  await db
    .insert(schema.equityGrants)
    .values({ ...fields, ownerUserId: owner });
  revalidate();
}

export async function updateGrant(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const fields = commonFields(formData);
  if (!fields.company) throw new Error("Company is required.");
  if (fields.vestedShares > fields.totalShares) {
    throw new Error("Vested shares cannot exceed total shares.");
  }
  const owner = await getOwner();
  await db
    .update(schema.equityGrants)
    .set({ ...fields, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.equityGrants.id, id),
        ownedBy(schema.equityGrants.ownerUserId, owner),
      ),
    );
  revalidate(id);
}

export async function deleteGrant(formData: FormData) {
  await assertAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("Invalid id.");
  const owner = await getOwner();
  await db
    .delete(schema.equityGrants)
    .where(
      and(
        eq(schema.equityGrants.id, id),
        ownedBy(schema.equityGrants.ownerUserId, owner),
      ),
    );
  revalidate();
  redirect("/equity");
}
