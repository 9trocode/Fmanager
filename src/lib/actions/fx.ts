"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { SUPPORTED_CURRENCIES } from "@/lib/format";

const ENDPOINT = "https://open.er-api.com/v6/latest";

type ApiResponse = {
  result: "success" | "error";
  base_code: string;
  rates: Record<string, number>;
  time_last_update_utc?: string;
  "error-type"?: string;
};

export async function refreshFxRates(base = "USD") {
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
