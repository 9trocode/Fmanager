import "server-only";
import {
  listAccountsWithEffective,
  listBudgets,
  listFlows,
  listGrants,
  listTransactions,
  listTransactionsBetween,
} from "@/lib/db/queries";
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

export type CurrencyBucket = {
  /** Sum of values in their native currency (no FX applied). */
  native: number;
  /** Sum converted into the base currency. Useful for proportions / comparisons. */
  inBase: number;
};

export type NetWorthSummary = {
  baseCurrency: string;
  totals: Record<Scenario, number>;
  byCategory: Record<Scenario, Record<CategoryKey, number>>;
  /** Per-currency totals. Native-amount + base-equivalent for honest display. */
  byCurrency: Record<Scenario, Record<string, CurrencyBucket>>;
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
  const byCurrency: Record<Scenario, Record<string, CurrencyBucket>> = {
    floor: {},
    expected: {},
    liquid: {},
  };

  function addCurrency(
    s: Scenario,
    currency: string,
    native: number,
    inBase: number,
  ) {
    if (!byCurrency[s][currency]) {
      byCurrency[s][currency] = { native: 0, inBase: 0 };
    }
    byCurrency[s][currency].native += native;
    byCurrency[s][currency].inBase += inBase;
  }

  let hasData = false;

  for (const a of accounts) {
    if (a.effectiveValue == null) continue;
    hasData = true;
    const signed = isLiability(a.type) ? -a.effectiveValue : a.effectiveValue;
    const inBase = await convert(signed, a.currency, baseCurrency);
    for (const s of SCENARIOS) {
      byCategory[s][a.type] += inBase;
      addCurrency(s, a.currency, signed, inBase);
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
      addCurrency(s, g.currency, value, inBase);
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

export type MonthActuals = {
  baseCurrency: string;
  income: number;
  expenses: number;
  net: number;
  txCount: number;
  monthLabel: string;
};

export async function computeThisMonthActuals(
  baseCurrency: string,
): Promise<MonthActuals> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);

  const txs = await listTransactionsBetween(start, end);

  let income = 0;
  let expenses = 0;
  let count = 0;
  for (const t of txs) {
    if (t.kind === "transfer") continue;
    const inBase = await convert(t.amount, t.currency, baseCurrency);
    if (t.kind === "income") income += inBase;
    else expenses += inBase;
    count++;
  }
  const monthLabel = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  return {
    baseCurrency,
    income,
    expenses,
    net: income - expenses,
    txCount: count,
    monthLabel,
  };
}

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

export type BudgetStatus = {
  id: number;
  category: string;
  monthlyLimit: number;
  spentThisMonth: number;
  remaining: number;
  percentUsed: number;
  /** Currency the budget is tracked in (typically the user's base currency). */
  baseCurrency: string;
  /** Account this budget scopes to. Null means "any account". */
  accountId: number | null;
  notes: string | null;
};

export type BudgetSummary = {
  baseCurrency: string;
  rows: BudgetStatus[];
  overBudget: BudgetStatus[];
  totalLimit: number;
  totalSpent: number;
};

/**
 * Boundaries of the *current* calendar month in the server's local
 * timezone. Returns YYYY-MM-DD strings that match how transactions are
 * stored (`occurred_at` is a date-only string entered by the user, not a
 * timestamp).
 *
 * Why local — not UTC: a user in Lagos (UTC+1) logging a 11:30 PM
 * transaction on Jan 31 is unambiguously a January transaction in their
 * lived time, even though it's already Feb 1 UTC. Self-hosted servers
 * usually run in the user's TZ (or `TZ=` env var), so local-time math
 * matches the user's expectations on month rollovers. The server-side
 * Date constructor reflects this without any extra config.
 */
function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    from: ymd(new Date(y, m, 1)),
    to: ymd(new Date(y, m + 1, 0)),
  };
}

/**
 * `YYYY-MM-DD` of a Date *in local time* — independent of the host's
 * default toISOString() (which is always UTC). Used so date strings the
 * server emits match what the user picked in `<input type="date">` form
 * controls (those also operate on local time).
 */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function computeBudgetStatus(
  baseCurrency: string,
): Promise<BudgetSummary> {
  const budgets = await listBudgets();
  if (budgets.length === 0) {
    return {
      baseCurrency,
      rows: [],
      overBudget: [],
      totalLimit: 0,
      totalSpent: 0,
    };
  }

  const { from, to } = currentMonthRange();
  const monthTxs = await listTransactions({
    kind: "expense",
    dateFrom: from,
    dateTo: to,
  });

  const rows: BudgetStatus[] = [];
  let totalLimit = 0;
  let totalSpent = 0;

  for (const b of budgets) {
    let spent = 0;
    for (const t of monthTxs) {
      if (t.kind !== "expense") continue;
      if (!t.category || t.category !== b.category) continue;
      // If the budget is scoped to a specific account, only count
      // transactions on that account. Null accountId means
      // "any account" (the original default behavior).
      if (b.accountId != null && t.accountId !== b.accountId) continue;
      const inBudgetCcy = await convert(t.amount, t.currency, b.currency);
      spent += inBudgetCcy;
    }
    const remaining = b.monthlyLimit - spent;
    const percentUsed =
      b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
    const status: BudgetStatus = {
      id: b.id,
      category: b.category,
      monthlyLimit: b.monthlyLimit,
      spentThisMonth: spent,
      remaining,
      percentUsed,
      baseCurrency: b.currency,
      accountId: b.accountId ?? null,
      notes: b.notes ?? null,
    };
    rows.push(status);
    // Roll up totals into the overall base currency for the summary cards.
    const limitInBase = await convert(b.monthlyLimit, b.currency, baseCurrency);
    const spentInBase = await convert(spent, b.currency, baseCurrency);
    totalLimit += limitInBase;
    totalSpent += spentInBase;
  }

  rows.sort((a, b) => b.percentUsed - a.percentUsed);
  const overBudget = rows.filter((r) => r.percentUsed > 100);

  return {
    baseCurrency,
    rows,
    overBudget,
    totalLimit,
    totalSpent,
  };
}
