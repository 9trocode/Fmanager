import "server-only";
import {
  listAccounts,
  listGrants,
  listTransactionsBetween,
} from "@/lib/db/queries";
import { computeNetWorthAsOf } from "@/lib/aggregation";
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
  totals: {
    income: number;
    expenses: number;
    net: number;
    /** Latest net worth (end of the most recent month). */
    netWorth: number;
    /** Best-month net (income − expenses) for the cover stat strip. */
    bestMonthNet: number;
    bestMonthLabel: string;
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

  const [accounts, grants] = await Promise.all([listAccounts(), listGrants()]);

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
  const netWorthByMonth = new Map<
    string,
    { netWorth: number; cash: number; investments: number; equityLiquid: number }
  >();
  for (const m of months) {
    const nw = await computeNetWorthAsOf(m.endDate, opts.baseCurrency);
    let cash = 0;
    let investments = 0;
    for (const a of nw.perAccount) {
      const acct = accountById.get(a.id);
      if (!acct) continue;
      if (acct.type === "cash") cash += a.inBase;
      if (acct.type === "brokerage" || acct.type === "crypto" || acct.type === "retirement") {
        investments += a.inBase;
      }
    }
    // Equity liquid for the month — naive: same scenario applied today
    // (we don't backfill historical FMVs).
    const equityLiquid = grants.reduce((sum, g) => {
      const native = equityValueForScenario(g, "liquid");
      return sum + rates.convert(native, g.currency, opts.baseCurrency);
    }, 0);
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

  // Per-account month-end balances (in both native + base).
  const accountMonthly: AccountMonthly[] = [];
  for (const m of months) {
    const nw = await computeNetWorthAsOf(m.endDate, opts.baseCurrency);
    for (const row of nw.perAccount) {
      accountMonthly.push({
        monthKey: m.key,
        accountId: row.id,
        closingNative: row.effective ?? 0,
        closingBase: row.inBase,
      });
    }
  }

  // Accounts table — closing balance at end of last month.
  const lastNw = await computeNetWorthAsOf(toMonth.endDate, opts.baseCurrency);
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

  // Totals + best-month.
  let totalIncome = 0;
  let totalExpenses = 0;
  let bestMonthNet = -Infinity;
  let bestMonthLabel = "";
  for (const r of monthRows) {
    totalIncome += r.income;
    totalExpenses += r.expenses;
    if (r.net > bestMonthNet) {
      bestMonthNet = r.net;
      bestMonthLabel = r.label;
    }
  }
  const latest = monthRows[monthRows.length - 1];

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
    totals: {
      income: totalIncome,
      expenses: totalExpenses,
      net: totalIncome - totalExpenses,
      netWorth: latest?.netWorth ?? 0,
      bestMonthNet: bestMonthNet === -Infinity ? 0 : bestMonthNet,
      bestMonthLabel,
    },
  };
}
