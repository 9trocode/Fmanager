import "server-only";
import {
  listAccounts,
  listBudgets,
  listGrants,
  listSavingsGoals,
  listTransactionsBetween,
} from "@/lib/db/queries";
import { computeNetWorthAsOf } from "@/lib/aggregation";
import { computeGoalState, type Goal } from "@/lib/goals";
import { prefetchRates } from "@/lib/fx";
import {
  SCENARIOS,
  equityValueForScenario,
  type Scenario,
} from "@/lib/scenarios";
import type { AccountType } from "@/lib/db/schema";

/**
 * Bundled monthly statement payload — everything the Excel/PDF
 * builders render. Computed once on the server, shared across formats.
 */
export type MonthlyStatement = {
  baseCurrency: string;
  generatedAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  range: { fromMonth: string; toMonth: string };
  months: MonthRow[];
  accounts: AccountRow[];
  /** Closing balance per account at the end of each month, in account currency. */
  accountMonthly: AccountMonthly[];
  /** Every transaction inside the range, lightly enriched. */
  transactions: TxRow[];
  equity: EquityRow[];
  /** Spend by category aggregated across the full range. */
  categories: CategoryRow[];
  /** Active savings goals + computed progress state. */
  goals: GoalRow[];
  /** Budgets snapshot — current-month status. */
  budgets: BudgetRow[];
  totals: {
    income: number;
    expenses: number;
    net: number;
    /** Latest net worth (end of the most recent month). */
    netWorth: number;
    /** Best-month net (income − expenses) for the cover stat strip. */
    bestMonthNet: number;
    bestMonthLabel: string;
    /** Net worth at the start of the period (for the headline delta). */
    netWorthStart: number;
    /** Absolute Δ over the period (latest − start). */
    netWorthDelta: number;
    /** Current monthly burn (avg of last 3 months expenses). */
    monthlyBurn: number;
    /** Months of runway against current burn (cash + investments / burn). null if no burn. */
    runwayMonths: number | null;
  };
};

export type MonthRow = {
  /** "YYYY-MM" */
  key: string;
  /** "Jan 2026" */
  label: string;
  income: number;
  expenses: number;
  net: number;
  /** net / income, capped at [-1, 1]. null if income=0. */
  savingsRate: number | null;
  netWorth: number;
  cash: number;
  investments: number;
  equityLiquid: number;
  txCount: number;
};

export type AccountRow = {
  id: number;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  closingBase: number;
  closingNative: number;
};

export type AccountMonthly = {
  monthKey: string;
  accountId: number;
  /** Closing balance in account currency. */
  closingNative: number;
  /** Closing balance in base currency (signed for liabilities). */
  closingBase: number;
};

export type TxRow = {
  id: number;
  date: string;
  monthKey: string;
  account: string;
  destAccount: string | null;
  kind: "income" | "expense" | "transfer";
  category: string | null;
  amount: number;
  currency: string;
  amountBase: number;
  notes: string | null;
};

export type EquityRow = {
  id: number;
  account: string;
  company: string;
  grantType: string;
  totalShares: number;
  vestedShares: number;
  strike: number | null;
  fmv: number | null;
  currency: string;
  /** scenario → value in base currency */
  values: Record<Scenario, number>;
};

export type CategoryRow = {
  category: string;
  /** Total spend across the full range, in base currency. */
  totalBase: number;
  /** Share of total expenses (0..1). */
  share: number;
  /** Per-month spend series, oldest first. Length === months.length. */
  perMonth: number[];
  txCount: number;
};

export type GoalRow = {
  id: number;
  name: string;
  kind: string;
  currency: string;
  /** target / current in goal currency. */
  target: number | null;
  current: number;
  /** progress 0..1 (capped). null when target unknown. */
  progress: number | null;
  monthlyContribution: number;
  /** Months until target at current pace, null if unreachable. */
  etaMonths: number | null;
  /** Whether the goal is on track for its target date / horizon. */
  onPace: boolean | null;
  done: boolean;
};

export type BudgetRow = {
  id: number;
  category: string;
  currency: string;
  monthlyLimit: number;
  spentThisMonth: number;
  percentUsed: number;
  /** > 100 = over, 80-100 = warning, < 80 = healthy. */
  status: "healthy" | "warning" | "over";
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthLabel(year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * Build a list of N months ending on `end` (inclusive), oldest first.
 */
export function monthRange(monthsBack: number, end: Date = new Date()) {
  const result: { key: string; label: string; start: string; endDate: string }[] = [];
  const e = new Date(end.getFullYear(), end.getMonth(), 1);
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(e.getFullYear(), e.getMonth() - i, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    result.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: monthLabel(d.getFullYear(), d.getMonth()),
      start: ymd(d),
      endDate: ymd(last),
    });
  }
  return result;
}

export type BuildOptions = {
  monthsBack: number;
  baseCurrency: string;
  ownerName?: string | null;
  ownerEmail?: string | null;
};

export async function buildMonthlyStatement(
  opts: BuildOptions,
): Promise<MonthlyStatement> {
  const months = monthRange(opts.monthsBack);
  const fromMonth = months[0];
  const toMonth = months[months.length - 1];

  const [accounts, grants, goalsRaw, budgetsRaw] = await Promise.all([
    listAccounts(),
    listGrants(),
    listSavingsGoals(),
    listBudgets(),
  ]);

  // One transaction sweep over the entire range — much cheaper than per-month.
  const allTxs = await listTransactionsBetween(fromMonth.start, toMonth.endDate);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  // Pre-fetch FX for every (txCcy → baseCcy) pair we'll need.
  const ratePairs = allTxs.map(
    (t) => [t.currency, opts.baseCurrency] as const,
  );
  for (const a of accounts) ratePairs.push([a.currency, opts.baseCurrency]);
  for (const g of grants) ratePairs.push([g.currency, opts.baseCurrency]);
  const rates = await prefetchRates(ratePairs);

  // Bucket transactions by month for fast scan.
  const byMonth = new Map<string, typeof allTxs>();
  for (const t of allTxs) {
    const k = t.occurredAt.slice(0, 7);
    let bucket = byMonth.get(k);
    if (!bucket) {
      bucket = [];
      byMonth.set(k, bucket);
    }
    bucket.push(t);
  }

  // Closing net-worth per month — uses the same FX-aware computation
  // the dashboard uses, just walked across the range.
  //
  // Was: two sequential `for (m of months) await computeNetWorthAsOf(...)`
  // loops PLUS a third standalone call for the latest month — 12+12+1 = 25
  // serial computations, each of which previously fanned out to ~2N
  // queries (now batched to 2 thanks to the aggregation refactor).
  // Now: one parallel Promise.all across the 12 months, results
  // shared by both the month-row loop and the per-account-monthly
  // loop. The "latest" view is just the last month's result.
  const nwByMonth = new Map<string, Awaited<ReturnType<typeof computeNetWorthAsOf>>>();
  await Promise.all(
    months.map(async (m) => {
      const nw = await computeNetWorthAsOf(m.endDate, opts.baseCurrency);
      nwByMonth.set(m.key, nw);
    }),
  );

  // Equity liquid is currently a "today's value" snapshot — no
  // historical FMV backfill — so it's the same number every month.
  // Compute once outside the loop.
  const equityLiquid = grants.reduce((sum, g) => {
    const native = equityValueForScenario(g, "liquid");
    return sum + rates.convert(native, g.currency, opts.baseCurrency);
  }, 0);

  const netWorthByMonth = new Map<
    string,
    { netWorth: number; cash: number; investments: number; equityLiquid: number }
  >();
  for (const m of months) {
    const nw = nwByMonth.get(m.key)!;
    let cash = 0;
    let investments = 0;
    for (const a of nw.perAccount) {
      const acct = accountById.get(a.id);
      if (!acct) continue;
      if (acct.type === "cash") cash += a.inBase;
      if (
        acct.type === "investment" ||
        acct.type === "brokerage" ||
        acct.type === "crypto" ||
        acct.type === "retirement"
      ) {
        investments += a.inBase;
      }
    }
    netWorthByMonth.set(m.key, {
      netWorth: nw.total,
      cash,
      investments,
      equityLiquid,
    });
  }

  // Per-month income/expense totals + tx count.
  const monthRows: MonthRow[] = months.map((m) => {
    const txs = byMonth.get(m.key) ?? [];
    let income = 0;
    let expenses = 0;
    let count = 0;
    for (const t of txs) {
      if (t.kind === "transfer") continue;
      const inBase = rates.convert(t.amount, t.currency, opts.baseCurrency);
      if (t.kind === "income") income += inBase;
      else expenses += inBase;
      count++;
    }
    const net = income - expenses;
    const savingsRate = income > 0 ? Math.max(-1, Math.min(1, net / income)) : null;
    const nw = netWorthByMonth.get(m.key) ?? {
      netWorth: 0,
      cash: 0,
      investments: 0,
      equityLiquid: 0,
    };
    return {
      key: m.key,
      label: m.label,
      income,
      expenses,
      net,
      savingsRate,
      netWorth: nw.netWorth,
      cash: nw.cash,
      investments: nw.investments,
      equityLiquid: nw.equityLiquid,
      txCount: count,
    };
  });

  // Per-account month-end balances (in both native + base). Reuse
  // the parallel-fetched nwByMonth map — no extra queries.
  const accountMonthly: AccountMonthly[] = [];
  for (const m of months) {
    const nw = nwByMonth.get(m.key)!;
    for (const row of nw.perAccount) {
      accountMonthly.push({
        monthKey: m.key,
        accountId: row.id,
        closingNative: row.effective ?? 0,
        closingBase: row.inBase,
      });
    }
  }

  // Accounts table — closing balance at end of last month. Reuse
  // the last month's already-computed snapshot.
  const lastNw = nwByMonth.get(toMonth.key)!;
  const accountRows: AccountRow[] = accounts.map((a) => {
    const row = lastNw.perAccount.find((r) => r.id === a.id);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      institution: a.institution ?? null,
      closingBase: row?.inBase ?? 0,
      closingNative: row?.effective ?? 0,
    };
  });

  // Transactions list.
  const txRows: TxRow[] = allTxs.map((t) => {
    const acct = accountById.get(t.accountId);
    const dest =
      t.destAccountId != null ? accountById.get(t.destAccountId) : null;
    return {
      id: t.id,
      date: t.occurredAt,
      monthKey: t.occurredAt.slice(0, 7),
      account: acct?.name ?? `#${t.accountId}`,
      destAccount: dest?.name ?? null,
      kind: t.kind,
      category: t.category ?? null,
      amount: t.amount,
      currency: t.currency,
      amountBase: rates.convert(t.amount, t.currency, opts.baseCurrency),
      notes: t.notes ?? null,
    };
  });

  // Equity grants — three scenarios.
  const equityRows: EquityRow[] = grants.map((g) => {
    const acct = g.accountId != null ? accountById.get(g.accountId) : null;
    const values: Record<Scenario, number> = {} as Record<Scenario, number>;
    for (const s of SCENARIOS) {
      values[s] = rates.convert(
        equityValueForScenario(g, s),
        g.currency,
        opts.baseCurrency,
      );
    }
    return {
      id: g.id,
      account: acct?.name ?? "—",
      company: g.company,
      grantType: g.grantType,
      totalShares: g.totalShares,
      vestedShares: g.vestedShares,
      strike: g.strikePrice,
      fmv: g.fmvPerShare,
      currency: g.currency,
      values,
    };
  });

  // ── Categories aggregation ──────────────────────────────────────
  // For every expense tx, bucket into category × month. Top 12 by
  // total spend make it onto the categories page; the rest collapse
  // into an implicit "Other" bucket the renderer can choose to show.
  const monthIdxByKey = new Map(months.map((m, i) => [m.key, i]));
  const catTotals = new Map<string, number>();
  const catPerMonth = new Map<string, number[]>();
  const catCounts = new Map<string, number>();
  for (const t of allTxs) {
    if (t.kind !== "expense") continue;
    const cat = (t.category ?? "Uncategorized").trim() || "Uncategorized";
    const inBase = rates.convert(t.amount, t.currency, opts.baseCurrency);
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + inBase);
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
    let series = catPerMonth.get(cat);
    if (!series) {
      series = new Array(months.length).fill(0);
      catPerMonth.set(cat, series);
    }
    const mi = monthIdxByKey.get(t.occurredAt.slice(0, 7));
    if (mi != null) series[mi] += inBase;
  }
  let totalExpenses = 0;
  for (const v of catTotals.values()) totalExpenses += v;
  const categories: CategoryRow[] = Array.from(catTotals.entries())
    .map(([category, totalBase]) => ({
      category,
      totalBase,
      share: totalExpenses > 0 ? totalBase / totalExpenses : 0,
      perMonth: catPerMonth.get(category) ?? new Array(months.length).fill(0),
      txCount: catCounts.get(category) ?? 0,
    }))
    .sort((a, b) => b.totalBase - a.totalBase);

  // ── Goals snapshot ──────────────────────────────────────────────
  const goalRows: GoalRow[] = [];
  for (const g of goalsRaw) {
    if (g.archived) continue;
    let state;
    try {
      state = await computeGoalState(g as Goal, opts.baseCurrency);
    } catch {
      continue;
    }
    const target = g.targetAmount;
    const progress =
      target != null && target > 0
        ? Math.max(0, Math.min(1, state.current / target))
        : null;
    // Derive on-pace from horizon: done already counts; otherwise on
    // pace if eta fits within horizon, off-pace if it overruns.
    let onPace: boolean | null = null;
    if (state.done) onPace = true;
    else if (state.etaMonths != null && g.horizonMonths > 0) {
      onPace = state.etaMonths <= g.horizonMonths;
    }
    goalRows.push({
      id: g.id,
      name: g.name,
      kind: g.kind,
      currency: g.currency,
      target,
      current: state.current,
      progress,
      monthlyContribution: g.monthlyContribution,
      etaMonths: state.etaMonths,
      onPace,
      done: state.done,
    });
  }

  // ── Budgets snapshot — current-month spend per category ─────────
  // Reuses the latest-month bucket of the categories computation so
  // we don't re-scan transactions.
  const latestKey = toMonth.key;
  const spendThisMonthByCategoryLower = new Map<string, number>();
  for (const t of byMonth.get(latestKey) ?? []) {
    if (t.kind !== "expense") continue;
    const cat = (t.category ?? "").trim().toLowerCase();
    if (!cat) continue;
    // Convert into the budget's currency lazily inside the loop below;
    // store native here keyed by category lowercase.
    const pre = spendThisMonthByCategoryLower.get(cat) ?? 0;
    spendThisMonthByCategoryLower.set(
      cat,
      pre + rates.convert(t.amount, t.currency, opts.baseCurrency),
    );
  }
  const budgetRows: BudgetRow[] = budgetsRaw.map((b) => {
    // Spend was computed in base; convert into the budget's currency
    // so the % vs limit comparison stays apples-to-apples.
    const spentBase = spendThisMonthByCategoryLower.get(
      b.category.trim().toLowerCase(),
    ) ?? 0;
    const spent = rates.convert(spentBase, opts.baseCurrency, b.currency);
    const percent = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
    const status: BudgetRow["status"] =
      percent > 100 ? "over" : percent >= 80 ? "warning" : "healthy";
    return {
      id: b.id,
      category: b.category,
      currency: b.currency,
      monthlyLimit: b.monthlyLimit,
      spentThisMonth: spent,
      percentUsed: percent,
      status,
    };
  });

  // ── Top-line totals + period delta + runway ─────────────────────
  let totalIncome = 0;
  let bestMonthNet = -Infinity;
  let bestMonthLabel = "";
  for (const r of monthRows) {
    totalIncome += r.income;
    if (r.net > bestMonthNet) {
      bestMonthNet = r.net;
      bestMonthLabel = r.label;
    }
  }
  const latest = monthRows[monthRows.length - 1];
  const first = monthRows[0];
  const netWorthStart = first?.netWorth ?? 0;
  const netWorth = latest?.netWorth ?? 0;
  const netWorthDelta = netWorth - netWorthStart;

  // Burn = average monthly expense over the last min(3, N) months —
  // smoother than just "last month" for runway calc.
  const burnWindow = monthRows.slice(-3);
  const monthlyBurn =
    burnWindow.length > 0
      ? burnWindow.reduce((s, m) => s + m.expenses, 0) / burnWindow.length
      : 0;
  const liquidNow = (latest?.cash ?? 0) + (latest?.investments ?? 0);
  const runwayMonths =
    monthlyBurn > 0 ? Math.max(0, liquidNow / monthlyBurn) : null;

  return {
    baseCurrency: opts.baseCurrency,
    generatedAt: new Date().toISOString(),
    ownerName: opts.ownerName ?? null,
    ownerEmail: opts.ownerEmail ?? null,
    range: { fromMonth: fromMonth.label, toMonth: toMonth.label },
    months: monthRows,
    accounts: accountRows,
    accountMonthly,
    transactions: txRows,
    equity: equityRows,
    categories,
    goals: goalRows,
    budgets: budgetRows,
    totals: {
      income: totalIncome,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
      netWorth,
      bestMonthNet: bestMonthNet === -Infinity ? 0 : bestMonthNet,
      bestMonthLabel,
      netWorthStart,
      netWorthDelta,
      monthlyBurn,
      runwayMonths,
    },
  };
}
