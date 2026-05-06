import "server-only";
import { listAccountsWithEffective, listFlows, listGrants } from "@/lib/db/queries";
import { convert } from "@/lib/fx";
import { isLiability } from "@/lib/account-types";
import { monthlyEquivalent } from "@/lib/flows";
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
    listAccountsWithEffective({ includeArchived: false }),
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
    if (a.effectiveValue == null) continue;
    hasData = true;
    const signed = isLiability(a.type) ? -a.effectiveValue : a.effectiveValue;
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

export type CashFlowSummary = {
  baseCurrency: string;
  income: number;
  expenses: number;
  net: number;
  byCategory: { income: Record<string, number>; expense: Record<string, number> };
};

export async function computeMonthlyCashFlow(
  baseCurrency: string,
): Promise<CashFlowSummary> {
  const flows = await listFlows();
  const result: CashFlowSummary = {
    baseCurrency,
    income: 0,
    expenses: 0,
    net: 0,
    byCategory: { income: {}, expense: {} },
  };
  for (const f of flows) {
    const monthly = monthlyEquivalent(f.amount, f.cadence);
    const inBase = await convert(monthly, f.currency, baseCurrency);
    const cat = f.category ?? "Other";
    if (f.kind === "income") {
      result.income += inBase;
      result.byCategory.income[cat] = (result.byCategory.income[cat] ?? 0) + inBase;
    } else {
      result.expenses += inBase;
      result.byCategory.expense[cat] = (result.byCategory.expense[cat] ?? 0) + inBase;
    }
  }
  result.net = result.income - result.expenses;
  return result;
}

export type RunwaySummary = {
  baseCurrency: string;
  liquidCash: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  netMonthly: number;
  /** Months of runway against expenses, ignoring income. null if no expenses. */
  monthsRunway: number | null;
  /** Months of runway against net burn (expenses - income). null if income covers expenses. */
  monthsNetRunway: number | null;
};

export async function computeCashRunway(
  baseCurrency: string,
): Promise<RunwaySummary> {
  const summary = await computeNetWorth(baseCurrency);
  const flow = await computeMonthlyCashFlow(baseCurrency);

  // Cash-like = cash + brokerage + crypto. Excludes real estate, retirement
  // (penalties to liquidate), grants (illiquid), and loans (already negative).
  const cats = summary.byCategory.floor;
  const liquidCash = Math.max(0, cats.cash + cats.brokerage + cats.crypto);

  const monthsRunway =
    flow.expenses > 0 ? liquidCash / flow.expenses : null;
  const netBurn = Math.max(0, flow.expenses - flow.income);
  const monthsNetRunway = netBurn > 0 ? liquidCash / netBurn : null;

  return {
    baseCurrency,
    liquidCash,
    monthlyExpenses: flow.expenses,
    monthlyIncome: flow.income,
    netMonthly: flow.net,
    monthsRunway,
    monthsNetRunway,
  };
}
