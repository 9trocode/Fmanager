import "server-only";
import { cache } from "react";
import { db, schema } from "@/lib/db";
import { desc, eq, and } from "drizzle-orm";

const STALE_HOURS = 12;

const FALLBACK: Record<string, Record<string, number>> = {
  USD: { EUR: 0.92, GBP: 0.79, NGN: 1550, CAD: 1.37, CHF: 0.88, JPY: 156, USD: 1 },
  EUR: { USD: 1.09, GBP: 0.86, NGN: 1685, CAD: 1.49, CHF: 0.96, JPY: 170, EUR: 1 },
  NGN: { USD: 0.000645, EUR: 0.000593, GBP: 0.000509, NGN: 1 },
};

/**
 * Per-request memo. Aggregation pages (`computeNetWorth`,
 * `computeBudgetStatus`, `computeMonthlyCashFlow`, advisor system prompt)
 * call `getRate(USD, baseCurrency)` and friends dozens of times per
 * render. Wrapping in `react/cache` collapses repeated calls for the
 * same base/quote inside a single request to one SQLite read — biggest
 * single perceived-perf win on /dashboard, /transactions, /budgets,
 * /net-worth, /advisor.
 *
 * `cache()` is request-scoped (cleared between requests), so stale FX
 * rates can't leak across users or refreshes.
 */
export const getRate = cache(
  async (base: string, quote: string): Promise<number> => {
    if (base === quote) return 1;

    const cutoff = new Date(
      Date.now() - STALE_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const cached = await db
      .select()
      .from(schema.fxRates)
      .where(and(eq(schema.fxRates.base, base), eq(schema.fxRates.quote, quote)))
      .orderBy(desc(schema.fxRates.fetchedAt))
      .limit(1);

    if (cached[0] && cached[0].fetchedAt > cutoff) return cached[0].rate;

    const fallback = FALLBACK[base]?.[quote];
    if (fallback) return fallback;

    const inverse = FALLBACK[quote]?.[base];
    if (inverse) return 1 / inverse;

    return 1;
  },
);

export async function convert(
  amount: number,
  from: string,
  to: string,
): Promise<number> {
  if (from === to) return amount;
  const rate = await getRate(from, to);
  return amount * rate;
}
