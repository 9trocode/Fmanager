import "server-only";
import { cookies } from "next/headers";

/**
 * Server-side helper: pick the active month key for a request.
 *
 * Precedence: explicit `?m=YYYY-MM` URL param (if passed in) > the
 * `ff_month` cookie set by <MonthFilter> > undefined (the aggregator
 * falls back to the current month).
 *
 * The cookie is what makes the filter feel "global" — clicking another
 * sidebar item preserves the choice without us having to rewrite every
 * <Link href> to append `?m=`.
 */
export async function resolveMonthKey(
  paramValue?: string,
): Promise<string | undefined> {
  if (paramValue && /^(\d{4})-(\d{2})$/.test(paramValue)) {
    return paramValue;
  }
  const store = await cookies();
  const v = store.get("ff_month")?.value;
  if (v && /^(\d{4})-(\d{2})$/.test(v)) return v;
  return undefined;
}
