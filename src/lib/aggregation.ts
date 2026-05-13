import "server-only";
import { cache } from "react";
import {
  listAccounts,
  listAccountsWithEffective,
  listBudgets,
  listFlows,
  listGrants,
  listTransactions,
  listTransactionsBetween,
} from "@/lib/db/queries";
import { db, schema } from "@/lib/db";
import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import { convert, prefetchRates } from "@/lib/fx";
import { getOwner, ownedBy } from "@/lib/db/scope";
import { isLiability } from "@/lib/account-types";
import { monthlyEquivalent } from "@/lib/flows";
import {
  SCENARIOS,
  equityValueForScenario,
  type Scenario,
} from "@/lib/scenarios";
import type { AccountType } from "@/lib/db/schema";

export type CategoryKey = AccountType | "grant";

export type AsOfNetWorth = {
  asOf: string;
  baseCurrency: string;
  total: number;
  perAccount: Array<{
    id: number;
    name: string;
    type: AccountType;
    currency: string;
    snapshotAsOf: string | null;
    snapshotValue: number | null;
    /** Signed contribution from transactions between snapshot and asOf, in account currency. */
    delta: number;
    /** Effective balance at asOf in account currency (snapshotValue + delta). */
    effective: number | null;
    /** Same effective value converted into baseCurrency (signed for liabilities). */
    inBase: number;
  }>;
};

/**
 * Net worth at the end of an arbitrary date — i.e. "what was I worth
 * as of YYYY-MM-DD". For each account, pick the latest snapshot at
 * or before the date, then sum signed transactions in (snapshot, asOf]
 * using the same FX-aware rule as the live computation. Only the
 * cash side: equity grants are out of scope here because their
 * value is a current-rate / current-vested computation that isn't
 * meaningfully time-travel-able with the data we keep.
 */
export async function computeNetWorthAsOf(
  asOfDate: string,
  baseCurrency: string,
): Promise<AsOfNetWorth> {
  // listAccounts is owner-scoped; the batched selects below inherit
  // the scope via the account-id filter.
  const accounts = await listAccounts();
  if (accounts.length === 0) {
    return { asOf: asOfDate, baseCurrency, total: 0, perAccount: [] };
  }
  const owner = await getOwner();
  const ids = accounts.map((a) => a.id);

  // ── Batch snapshot fetch ────────────────────────────────────────
  // Was: N separate "latest snapshot for account X at or before Y"
  // queries. The export feature loops this 12× per call → 12N queries
  // per export. Now: one query that picks the latest (asOf, id) per
  // account via the same window-style subquery used by
  // listAccountsWithEffective. (account_id, as_of) composite index
  // makes each per-account pick a b-tree walk, not a scan.
  const latestSnapshots = await db
    .select()
    .from(schema.valueSnapshots)
    .where(
      and(
        inArray(schema.valueSnapshots.accountId, ids),
        lte(schema.valueSnapshots.asOf, asOfDate),
        ownedBy(schema.valueSnapshots.ownerUserId, owner),
        sql`(${schema.valueSnapshots.accountId}, ${schema.valueSnapshots.asOf}, ${schema.valueSnapshots.id}) IN (
          SELECT account_id, MAX(as_of), MAX(id)
          FROM value_snapshots
          WHERE account_id IN ${ids}
            AND as_of <= ${asOfDate}
          GROUP BY account_id, as_of
        )`,
      ),
    );
  const latestByAccount = new Map(
    latestSnapshots.map((s) => [s.accountId, s]),
  );

  // Earliest snapshot date across the set — lower bound for the tx
  // scan so we don't pull years of unneeded rows.
  const earliestAsOf = latestSnapshots.reduce<string>((acc, s) => {
    return acc === "" || s.asOf < acc ? s.asOf : acc;
  }, "");

  // ── Batch tx fetch ──────────────────────────────────────────────
  // Was: N separate tx queries. Now: one query covering all accounts
  // (source OR destination), bucketed in memory below.
  const txs = earliestAsOf
    ? await db
        .select()
        .from(schema.transactions)
        .where(
          and(
            or(
              inArray(schema.transactions.accountId, ids),
              inArray(schema.transactions.destAccountId, ids),
            ),
            gt(schema.transactions.occurredAt, earliestAsOf),
            lte(schema.transactions.occurredAt, asOfDate),
            ownedBy(schema.transactions.ownerUserId, owner),
          ),
        )
    : [];

  // ── Prefetch every FX rate we'll need in one shot ──────────────
  // Was: per-tx awaited convert() inside the inner loop — at 100
  // mixed-currency txs that's 100 sequential awaits even with the
  // 12h cache. Now: pull both (txCcy → accountCcy) and (accountCcy
  // → baseCurrency) pairs into one rate map, then sync conversions
  // through the loop.
  const ratePairs: Array<readonly [string, string]> = [];
  for (const a of accounts) {
    ratePairs.push([a.currency, baseCurrency]);
  }
  for (const t of txs) {
    // Map tx currency to every account currency it could land on.
    // In practice each tx hits one account, so this overprovisions
    // slightly; the cost is a few extra Map entries.
    for (const a of accounts) {
      if (t.accountId === a.id || t.destAccountId === a.id) {
        ratePairs.push([t.currency, a.currency]);
      }
    }
  }
  const rates = await prefetchRates(ratePairs);

  // ── Build per-account result in one pass ───────────────────────
  const perAccount: AsOfNetWorth["perAccount"] = accounts.map((a) => {
    const latest = latestByAccount.get(a.id);
    if (!latest) {
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        snapshotAsOf: null,
        snapshotValue: null,
        delta: 0,
        effective: null,
        inBase: 0,
      };
    }
    let delta = 0;
    for (const t of txs) {
      // Skip tx dated on or before the snapshot — snapshot wins.
      if (t.occurredAt <= latest.asOf) continue;
      const isSource = t.accountId === a.id;
      const isDest = t.destAccountId === a.id && t.kind === "transfer";
      if (!isSource && !isDest) continue;
      const inAccountCcy =
        t.currency === a.currency
          ? t.amount
          : rates.convert(t.amount, t.currency, a.currency);
      if (isSource) {
        if (t.kind === "expense" || t.kind === "transfer") delta -= inAccountCcy;
        else if (t.kind === "income") delta += inAccountCcy;
      }
      if (isDest) delta += inAccountCcy;
    }
    const effective = latest.value + delta;
    const signed = isLiability(a.type) ? -effective : effective;
    const inBase = rates.convert(signed, a.currency, baseCurrency);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      snapshotAsOf: latest.asOf,
      snapshotValue: latest.value,
      delta,
      effective,
      inBase,
    };
  });
  const total = perAccount.reduce((acc, r) => acc + r.inBase, 0);
  return { asOf: asOfDate, baseCurrency, total, perAccount };
}

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

/**
 * Per-request memo. Dashboard renders both `computeNetWorth` (used by
 * the headline + scenario panel) and `computeCashRunway`, which calls
 * `computeNetWorth` again internally — collapsing those into one read
 * is the largest single win on the home page.
 */
export const computeNetWorth = cache(async function computeNetWorthImpl(
  baseCurrency: string,
): Promise<NetWorthSummary> {
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

  // Prefetch every (currency → baseCurrency) rate in parallel before
  // walking accounts/grants. Without this, each row in the loop awaits
  // its own `getRate` call — fine when cached, but the first uncached
  // call per pair serialises through SQLite. Multi-currency dashboards
  // would do N round-trips back-to-back instead of all at once.
  const rates = await prefetchRates([
    ...accounts.map((a) => [a.currency, baseCurrency] as const),
    ...grants.map((g) => [g.currency, baseCurrency] as const),
  ]);

  for (const a of accounts) {
    if (a.effectiveValue == null) continue;
    hasData = true;
    const signed = isLiability(a.type) ? -a.effectiveValue : a.effectiveValue;
    const inBase = rates.convert(signed, a.currency, baseCurrency);
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
      const inBase = rates.convert(value, g.currency, baseCurrency);
      byCategory[s].grant += inBase;
      addCurrency(s, g.currency, value, inBase);
      totals[s] += inBase;
    }
  }

  return { baseCurrency, totals, byCategory, byCurrency, hasData };
});

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

/**
 * Per-request memo. Used by the dashboard headline + sometimes by
 * other surfaces — collapsing repeats inside one render is free perf.
 */
export const computeThisMonthActuals = cache(async function computeThisMonthActualsImpl(
  baseCurrency: string,
  monthKey?: string,
): Promise<MonthActuals> {
  const target = parseMonthKey(monthKey);
  const y = target.getFullYear();
  const m = target.getMonth();
  const start = ymd(new Date(y, m, 1));
  const end = ymd(new Date(y, m + 1, 0));

  const txs = await listTransactionsBetween(start, end);

  const rates = await prefetchRates(
    txs.map((t) => [t.currency, baseCurrency] as const),
  );

  let income = 0;
  let expenses = 0;
  let count = 0;
  for (const t of txs) {
    if (t.kind === "transfer") continue;
    const inBase = rates.convert(t.amount, t.currency, baseCurrency);
    if (t.kind === "income") income += inBase;
    else expenses += inBase;
    count++;
  }
  const monthLabel = target.toLocaleString("en-US", {
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
});

export type CashFlowSummary = {
  baseCurrency: string;
  income: number;
  expenses: number;
  net: number;
  byCategory: { income: Record<string, number>; expense: Record<string, number> };
};

/**
 * Per-request memo. Called both directly by /cash-flow / dashboard
 * AND transitively from `computeCashRunway` — without this, every
 * dashboard render fired this twice.
 */
export const computeMonthlyCashFlow = cache(async function computeMonthlyCashFlowImpl(
  baseCurrency: string,
  monthKey?: string,
): Promise<CashFlowSummary> {
  // PAST MONTHS LOCK TO ACTUALS.
  //
  // Editing a recurring income flow today must not retroactively
  // change March's income widget. If we built the past month from
  // the live flow template, raising salary $5k → $7k today would
  // also bump every past month's projected income to $7k everywhere
  // BudgetsCashFlowPanel / runs the dashboard uses this number.
  //
  // Past months were lived through; what landed in transactions is
  // the truth. Sum real income/expense rows in that month, grouped
  // by category, in base currency. The flow template only feeds
  // CURRENT and FUTURE months.
  const currentKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  if (monthKey && /^(\d{4})-(\d{2})$/.test(monthKey) && monthKey < currentKey) {
    const { from, to } = monthRange(monthKey);
    const monthTxs = await listTransactionsBetween(from, to);
    const past: CashFlowSummary = {
      baseCurrency,
      income: 0,
      expenses: 0,
      net: 0,
      byCategory: { income: {}, expense: {} },
    };
    const pastRates = await prefetchRates(
      monthTxs.map((t) => [t.currency, baseCurrency] as const),
    );
    for (const t of monthTxs) {
      if (t.kind === "transfer") continue;
      const inBase = pastRates.convert(t.amount, t.currency, baseCurrency);
      const cat = (t.category ?? "").trim() || "Other";
      if (t.kind === "income") {
        past.income += inBase;
        past.byCategory.income[cat] = (past.byCategory.income[cat] ?? 0) + inBase;
      } else {
        past.expenses += inBase;
        past.byCategory.expense[cat] = (past.byCategory.expense[cat] ?? 0) + inBase;
      }
    }
    past.net = past.income - past.expenses;
    return past;
  }

  const flows = await listFlows();
  // When the user is viewing a specific month, swap in any per-month
  // override of (amount, currency) so a "raise next August" change
  // doesn't bleed back into the current month's projection.
  const overrideByFlowId = new Map<
    number,
    { amount: number; currency: string }
  >();
  if (monthKey) {
    const owner = await getOwner();
    const rows = await db
      .select({
        flowId: schema.recurringFlowOverrides.flowId,
        amount: schema.recurringFlowOverrides.amount,
        currency: schema.recurringFlowOverrides.currency,
      })
      .from(schema.recurringFlowOverrides)
      .where(
        and(
          eq(schema.recurringFlowOverrides.monthKey, monthKey),
          ownedBy(schema.recurringFlowOverrides.ownerUserId, owner),
        ),
      );
    for (const r of rows) {
      overrideByFlowId.set(r.flowId, {
        amount: r.amount,
        currency: r.currency,
      });
    }
  }

  const result: CashFlowSummary = {
    baseCurrency,
    income: 0,
    expenses: 0,
    net: 0,
    byCategory: { income: {}, expense: {} },
  };
  // Build the rate-prefetch list using effective (possibly overridden)
  // currencies, so the convert() lookups below all hit warm cache.
  const ratePairs: Array<readonly [string, string]> = [];
  for (const f of flows) {
    const ovr = overrideByFlowId.get(f.id);
    ratePairs.push([ovr?.currency ?? f.currency, baseCurrency] as const);
  }
  const rates = await prefetchRates(ratePairs);
  for (const f of flows) {
    // Internal transfers (expense flow with destAccountId set) move
    // money between the user's own accounts — they're NOT income and
    // NOT a burn. Skip from the income/expense totals so runway,
    // "Free cash" widgets, and net-monthly math don't double-count
    // a savings contribution as both a debit and… well, nothing.
    if (f.kind === "expense" && f.destAccountId != null) continue;
    const ovr = overrideByFlowId.get(f.id);
    const effectiveAmount = ovr ? ovr.amount : f.amount;
    const effectiveCurrency = ovr ? ovr.currency : f.currency;
    const monthly = monthlyEquivalent(effectiveAmount, f.cadence);
    const inBase = rates.convert(monthly, effectiveCurrency, baseCurrency);
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
});

export type RunwaySummary = {
  baseCurrency: string;
  liquidCash: number;
  /** Total monthly outflow used for runway = recurring expense flows
   *  plus any budgeted spend that isn't already represented by a
   *  recurring flow (committed-but-not-flowed caps). */
  monthlyExpenses: number;
  monthlyIncome: number;
  netMonthly: number;
  /** Months of runway against expenses, ignoring income. null if no expenses. */
  monthsRunway: number | null;
  /** Months of runway against net burn (expenses - income). null if income covers expenses. */
  monthsNetRunway: number | null;
  /** Breakdown of `monthlyExpenses` so the UI can explain WHERE the
   *  burn number comes from. All values in base currency. */
  breakdown: {
    flowExpenses: number;
    /** Sum of budget caps for categories NOT already represented by a
     *  recurring flow. Added on top of flow expenses since budgets
     *  represent committed spend the user has signalled they intend
     *  to make, even if no flow is wired up. */
    unflowedBudgetCaps: number;
  };
};

export async function computeCashRunway(
  baseCurrency: string,
): Promise<RunwaySummary> {
  const summary = await computeNetWorth(baseCurrency);
  const [flow, budgetSummary] = await Promise.all([
    computeMonthlyCashFlow(baseCurrency),
    computeBudgetStatus(baseCurrency),
  ]);

  // Cash-like = cash + brokerage + crypto. Excludes real estate, retirement
  // (penalties to liquidate), grants (illiquid), and loans (already negative).
  const cats = summary.byCategory.floor;
  const liquidCash = Math.max(0, cats.cash + cats.brokerage + cats.crypto);

  // Budgets represent monthly spending commitments. Where a recurring
  // expense flow already exists for a category (e.g. flow "Rent" $1.2k
  // mirrors budget "Rent" $1.2k), counting both would double the burn.
  // So we add ONLY the budget caps whose category isn't already
  // represented in flow.byCategory.expense. The result is "the floor
  // of what I plan to spend each month" — flows are the auto-tracked
  // commitments; budgets fill in the gaps for things you've decided
  // to spend on but haven't (yet) wired a recurring flow for.
  const flowExpenseCategoriesLower = new Set(
    Object.keys(flow.byCategory.expense ?? {}).map((c) =>
      c.trim().toLowerCase(),
    ),
  );
  let unflowedBudgetCaps = 0;
  for (const r of budgetSummary.rows) {
    const cat = r.category.trim().toLowerCase();
    if (flowExpenseCategoriesLower.has(cat)) continue;
    // r.monthlyLimit is in r.baseCurrency (== the budget's currency).
    // computeBudgetStatus already pre-resolved rates for this — but
    // re-querying once more is cheap and keeps the dependency local.
    const inBase =
      r.baseCurrency === baseCurrency
        ? r.monthlyLimit
        : await convert(r.monthlyLimit, r.baseCurrency, baseCurrency);
    unflowedBudgetCaps += inBase;
  }

  const totalMonthlyExpenses = flow.expenses + unflowedBudgetCaps;
  const monthsRunway =
    totalMonthlyExpenses > 0 ? liquidCash / totalMonthlyExpenses : null;
  const netBurn = Math.max(0, totalMonthlyExpenses - flow.income);
  const monthsNetRunway = netBurn > 0 ? liquidCash / netBurn : null;

  return {
    baseCurrency,
    liquidCash,
    monthlyExpenses: totalMonthlyExpenses,
    monthlyIncome: flow.income,
    netMonthly: flow.income - totalMonthlyExpenses,
    monthsRunway,
    monthsNetRunway,
    breakdown: {
      flowExpenses: flow.expenses,
      unflowedBudgetCaps,
    },
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
/**
 * Boundaries of an arbitrary month in local time. Pass a `YYYY-MM`
 * `monthKey` to look at a past month; defaults to the current month.
 */
function monthRange(monthKey?: string): { from: string; to: string } {
  const target = parseMonthKey(monthKey);
  const y = target.getFullYear();
  const m = target.getMonth();
  return {
    from: ymd(new Date(y, m, 1)),
    to: ymd(new Date(y, m + 1, 0)),
  };
}

/**
 * Parses `YYYY-MM` into a local-time Date pinned to the 1st of that
 * month. Falls back to today if the input is missing or malformed —
 * lets callers blindly forward a query param without first-class
 * validation.
 */
function parseMonthKey(monthKey?: string): Date {
  if (!monthKey) return new Date();
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return new Date();
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (!Number.isFinite(year) || month < 0 || month > 11) return new Date();
  return new Date(year, month, 1);
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

/**
 * Per-request memo. Dashboard + /budgets both call this; sometimes
 * twice on the same render path.
 */
export const computeBudgetStatus = cache(async function computeBudgetStatusImpl(
  baseCurrency: string,
  monthKey?: string,
): Promise<BudgetSummary> {
  const allBudgets = await listBudgets();
  // Filter out budgets whose effective_from is AFTER the viewed
  // month. The viewed month defaults to the current calendar month
  // when no filter is set. This makes "new budget added on the
  // August view" invisible to May (current) and to any earlier
  // month — they only show up from August onward.
  const viewMonth = monthKey ?? (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const rawBudgets = allBudgets.filter((b) => {
    if (!b.effectiveFrom) return true;
    return b.effectiveFrom <= viewMonth;
  });
  if (rawBudgets.length === 0) {
    return {
      baseCurrency,
      rows: [],
      overBudget: [],
      totalLimit: 0,
      totalSpent: 0,
    };
  }

  // Apply per-month overrides for the active month (if any). The
  // override only swaps monthlyLimit + currency — the budget's
  // category, accountId, and notes stay the same.
  const overrideByBudgetId = new Map<
    number,
    { monthlyLimit: number; currency: string }
  >();
  if (monthKey) {
    const owner = await getOwner();
    const rows = await db
      .select({
        budgetId: schema.budgetOverrides.budgetId,
        monthlyLimit: schema.budgetOverrides.monthlyLimit,
        currency: schema.budgetOverrides.currency,
      })
      .from(schema.budgetOverrides)
      .where(
        and(
          eq(schema.budgetOverrides.monthKey, monthKey),
          ownedBy(schema.budgetOverrides.ownerUserId, owner),
        ),
      );
    for (const r of rows) {
      overrideByBudgetId.set(r.budgetId, {
        monthlyLimit: r.monthlyLimit,
        currency: r.currency,
      });
    }
  }
  const budgets = rawBudgets.map((b) => {
    const ovr = overrideByBudgetId.get(b.id);
    if (!ovr) return b;
    return { ...b, monthlyLimit: ovr.monthlyLimit, currency: ovr.currency };
  });

  const { from, to } = monthRange(monthKey);
  // Include transfers too: when the user budgets a planned movement
  // (e.g. "Savings to Wise USD: 200K NGN/mo") and logs the actual
  // transfer with that category, the budget should tick toward its
  // cap. Plain transfers (no category) get filtered out in the loop.
  const monthTxs = await listTransactions({
    dateFrom: from,
    dateTo: to,
  });

  // Pre-resolve every rate the nested loop will need. Without this,
  // the original code awaited `convert()` once per (budget × tx) pair —
  // 50 budgets × 500 txs is 25k microtask hops even with React's cache.
  const pairs: Array<readonly [string, string]> = [];
  for (const b of budgets) {
    pairs.push([b.currency, baseCurrency] as const);
    for (const t of monthTxs) pairs.push([t.currency, b.currency] as const);
  }
  const rates = await prefetchRates(pairs);

  const rows: BudgetStatus[] = [];
  let totalLimit = 0;
  let totalSpent = 0;

  for (const b of budgets) {
    let spent = 0;
    for (const t of monthTxs) {
      // Expense → outright spend that counts toward the cap.
      // Transfer → counts only when the user explicitly tagged it
      // with this budget's category (e.g. "I budgeted savings to
      // Wise USD" + a transfer transaction with the same category).
      // Income doesn't apply to budgets.
      if (t.kind === "income") continue;
      if (t.kind !== "expense" && t.kind !== "transfer") continue;
      if (!t.category || t.category !== b.category) continue;
      // If the budget is scoped to a specific account, only count
      // transactions on that account — UNLESS the transaction's
      // currency exactly matches the budget's currency. That escape
      // hatch handles the cross-currency-from-wrong-account case:
      // an NGN housing expense logged against a USD wallet (because
      // that's the account the card draws from) was previously
      // invisible to an NGN housing budget scoped to the NGN
      // account, and so 100% of NGN spend disappeared from budget
      // tracking. With this rule, currency-matched spend always
      // counts toward a same-currency budget, regardless of which
      // account it touches.
      if (b.accountId != null && t.accountId !== b.accountId) {
        if (t.currency !== b.currency) continue;
      }
      spent += rates.convert(t.amount, t.currency, b.currency);
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
    totalLimit += rates.convert(b.monthlyLimit, b.currency, baseCurrency);
    totalSpent += rates.convert(spent, b.currency, baseCurrency);
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
});
