"use server";

import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { assertAdmin, getCurrentUser } from "@/lib/auth/session";

const ENDPOINT = "https://open.er-api.com/v6/latest";

type ApiResponse = {
  result: "success" | "error";
  base_code: string;
  rates: Record<string, number>;
  time_last_update_utc?: string;
  "error-type"?: string;
};

export async function refreshFxRates(base = "USD") {
  await assertAdmin();
  // FX rate cache is host-shared. Isolated tenants implicitly use
  // whatever the host has refreshed; they don't get to rewrite it.
  const user = await getCurrentUser();
  if (user?.dataScope === "isolated") {
    throw new Error(
      "FX rates are managed by the instance host — your view uses the latest cached rates.",
    );
  }
  const res = await fetch(`${ENDPOINT}/${base}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`FX fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as ApiResponse;
  if (data.result !== "success") {
    throw new Error(`FX provider error: ${data["error-type"] ?? "unknown"}`);
  }

  const fetchedAt = new Date().toISOString();
  const inserts: Array<{
    base: string;
    quote: string;
    rate: number;
    fetchedAt: string;
  }> = [];

  for (const quote of SUPPORTED_CURRENCIES) {
    if (quote === base) continue;
    const rate = data.rates[quote];
    if (typeof rate !== "number") continue;
    inserts.push({ base, quote, rate, fetchedAt });
    inserts.push({ base: quote, quote: base, rate: 1 / rate, fetchedAt });
  }

  if (inserts.length > 0) {
    await db.insert(schema.fxRates).values(inserts);
  }

  await db
    .insert(schema.settings)
    .values({ key: "fx_last_refresh", value: fetchedAt })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value: fetchedAt, updatedAt: fetchedAt },
    });

  revalidatePath("/", "layout");
  return { fetchedAt, count: inserts.length / 2 };
}

/**
 * Set a manual FX override for one direction (and its inverse). Manual
 * rows beat any "api" row in `getRate()` regardless of fetched_at age,
 * so the host can correct the provider when reality disagrees (e.g.
 * NGN parallel-market rates).
 *
 * Host-only — isolated tenants share the host's FX cache and can't
 * rewrite it. Setting the same pair twice just stamps a fresher
 * fetched_at so the latest manual override wins.
 */
export async function setFxOverride(input: {
  base: string;
  quote: string;
  rate: number;
}) {
  await assertAdmin();
  const user = await getCurrentUser();
  if (user?.dataScope === "isolated") {
    throw new Error(
      "FX overrides are managed by the instance host.",
    );
  }
  const base = input.base.toUpperCase();
  const quote = input.quote.toUpperCase();
  if (base === quote) {
    throw new Error("Base and quote must differ.");
  }
  if (!Number.isFinite(input.rate) || input.rate <= 0) {
    throw new Error("Rate must be a positive number.");
  }

  const fetchedAt = new Date().toISOString();
  await db.insert(schema.fxRates).values([
    { base, quote, rate: input.rate, fetchedAt, source: "manual" },
    {
      base: quote,
      quote: base,
      rate: 1 / input.rate,
      fetchedAt,
      source: "manual",
    },
  ]);

  revalidatePath("/", "layout");
  return { base, quote, rate: input.rate, fetchedAt };
}

/**
 * Drop the manual override for a pair (both directions). Subsequent
 * lookups fall back to the most recent "api" row, then to the
 * hard-coded FALLBACK table.
 */
export async function clearFxOverride(input: {
  base: string;
  quote: string;
}) {
  await assertAdmin();
  const user = await getCurrentUser();
  if (user?.dataScope === "isolated") {
    throw new Error(
      "FX overrides are managed by the instance host.",
    );
  }
  const base = input.base.toUpperCase();
  const quote = input.quote.toUpperCase();

  const deleted = await db
    .delete(schema.fxRates)
    .where(
      and(
        eq(schema.fxRates.source, "manual"),
        or(
          and(
            eq(schema.fxRates.base, base),
            eq(schema.fxRates.quote, quote),
          ),
          and(
            eq(schema.fxRates.base, quote),
            eq(schema.fxRates.quote, base),
          ),
        ),
      ),
    )
    .returning({ id: schema.fxRates.id });

  revalidatePath("/", "layout");
  return { base, quote, cleared: deleted.length > 0 };
}

/**
 * List all currently-active manual overrides (one row per direction).
 * Used by the settings UI to render the existing-override list.
 */
export async function listFxOverrides() {
  const rows = await db
    .select()
    .from(schema.fxRates)
    .where(eq(schema.fxRates.source, "manual"))
    .orderBy(schema.fxRates.base, schema.fxRates.quote);
  return rows.map((r) => ({
    id: r.id,
    base: r.base,
    quote: r.quote,
    rate: r.rate,
    fetchedAt: r.fetchedAt,
  }));
}
