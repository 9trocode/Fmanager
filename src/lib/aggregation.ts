import "server-only";
import { listAccountsWithLatest, listGrants } from "@/lib/db/queries";
import { convert } from "@/lib/fx";
import { isLiability } from "@/lib/account-types";
import {
  SCENARIOS,
  equityValueForScenario,
  type Scenario,
} from "@/lib/scenarios";
import type { AccountType } from "@/lib/db/schema";

export type CategoryKey = AccountType | "grant";

export type NetWorthSummary = {
  baseCurrency: string;
  totals: Record<Scenario, number>;
  byCategory: Record<Scenario, Record<CategoryKey, number>>;
  byCurrency: Record<Scenario, Record<string, number>>;
  hasData: boolean;
};

function emptyCategory(): Record<CategoryKey, number> {
  return {
    cash: 0,
    brokerage: 0,
    crypto: 0,
    real_estate: 0,
    equity: 0,
    retirement: 0,
    loan: 0,
    other: 0,
    grant: 0,
  };
}

export async function computeNetWorth(baseCurrency: string): Promise<NetWorthSummary> {
  const [accounts, grants] = await Promise.all([
    listAccountsWithLatest({ includeArchived: false }),
    listGrants(),
  ]);

  const totals: Record<Scenario, number> = { floor: 0, expected: 0, liquid: 0 };
  const byCategory: Record<Scenario, Record<CategoryKey, number>> = {
    floor: emptyCategory(),
    expected: emptyCategory(),
    liquid: emptyCategory(),
  };
  const byCurrency: Record<Scenario, Record<string, number>> = {
    floor: {},
    expected: {},
    liquid: {},
  };

  let hasData = false;

  for (const a of accounts) {
    if (a.latestValue == null) continue;
    hasData = true;
    const signed = isLiability(a.type) ? -a.latestValue : a.latestValue;
    const inBase = await convert(signed, a.currency, baseCurrency);
    for (const s of SCENARIOS) {
      byCategory[s][a.type] += inBase;
      byCurrency[s][a.currency] = (byCurrency[s][a.currency] ?? 0) + inBase;
      totals[s] += inBase;
    }
  }

  for (const g of grants) {
    hasData = true;
    for (const s of SCENARIOS) {
      const value = equityValueForScenario(g, s);
      if (value === 0) continue;
      const inBase = await convert(value, g.currency, baseCurrency);
      byCategory[s].grant += inBase;
      byCurrency[s][g.currency] = (byCurrency[s][g.currency] ?? 0) + inBase;
      totals[s] += inBase;
    }
  }

  return { baseCurrency, totals, byCategory, byCurrency, hasData };
}

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  cash: "Cash",
  brokerage: "Brokerage",
  crypto: "Crypto",
  real_estate: "Real estate",
  retirement: "Retirement",
  equity: "Equity (direct)",
  grant: "Equity grants",
  other: "Other",
  loan: "Liabilities",
};

export const CATEGORY_DISPLAY_ORDER: CategoryKey[] = [
  "cash",
  "brokerage",
  "crypto",
  "retirement",
  "real_estate",
  "equity",
  "grant",
  "other",
  "loan",
];
