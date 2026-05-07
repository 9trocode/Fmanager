import { RunwayCard } from "@/components/app/runway-card";
import { BudgetsSummaryCard } from "@/components/app/budgets-summary-card";
import { MonthStatsRow } from "@/components/app/month-stats-row";
import { RecentTransactionsCard } from "@/components/app/recent-transactions-card";
import { SavingsSummaryCard } from "@/components/app/savings-summary-card";
import { NetWorthMiniCard } from "@/components/app/networth-mini-card";
import { listAccounts, listLatestTransactions, listSavingsGoals } from "@/lib/db/queries";
import {
  computeNetWorth,
  computeCashRunway,
  computeBudgetStatus,
  computeMonthlyCashFlow,
  computeThisMonthActuals,
} from "@/lib/aggregation";

/**
 * Per-card loader components for the dashboard.
 *
 * Each one is an async server component that fetches only what its
 * card needs and then renders it. Wrapping each loader in <Suspense>
 * at the page level means the dashboard shell paints instantly and
 * cards stream in independently as their data resolves.
 *
 * The aggregators (`computeNetWorth`, `computeBudgetStatus`, …) are
 * already wrapped in `react/cache`, so loaders that need overlapping
 * data share the work — calling `computeBudgetStatus` from both
 * MonthStatsRowLoader and BudgetsSummaryLoader hits the DB once per
 * request, not twice.
 */

export async function MonthStatsRowLoader({
  baseCurrency,
  monthKey,
}: {
  baseCurrency: string;
  monthKey: string | undefined;
}) {
  const [budgets, month, flows] = await Promise.all([
    computeBudgetStatus(baseCurrency, monthKey),
    computeThisMonthActuals(baseCurrency, monthKey),
    computeMonthlyCashFlow(baseCurrency),
  ]);
  return <MonthStatsRow month={month} budgets={budgets} flows={flows} />;
}

export async function RunwayCardLoader({
  baseCurrency,
}: {
  baseCurrency: string;
}) {
  const runway = await computeCashRunway(baseCurrency);
  return <RunwayCard runway={runway} />;
}

export async function BudgetsSummaryLoader({
  baseCurrency,
  monthKey,
}: {
  baseCurrency: string;
  monthKey: string | undefined;
}) {
  const summary = await computeBudgetStatus(baseCurrency, monthKey);
  return <BudgetsSummaryCard summary={summary} />;
}

export async function SavingsSummaryLoader() {
  const goals = await listSavingsGoals();
  return <SavingsSummaryCard goals={goals} />;
}

export async function RecentTransactionsLoader() {
  const [accounts, recentTxs] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listLatestTransactions(8),
  ]);
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  return (
    <RecentTransactionsCard txs={recentTxs} accountNameById={accountNameById} />
  );
}

export async function NetWorthMiniLoader({
  baseCurrency,
}: {
  baseCurrency: string;
}) {
  const summary = await computeNetWorth(baseCurrency);
  return <NetWorthMiniCard summary={summary} />;
}

// ─── Skeletons ──────────────────────────────────────────────────────────

const pulse = "animate-pulse";

export function StatsRowSkeleton() {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`rounded-xl border border-border bg-card/40 p-5 space-y-3 ${pulse}`}
        >
          <div className="h-3 w-28 rounded bg-muted/50" />
          <div className="h-9 w-36 rounded bg-muted/70" />
          <div className="h-2 w-40 rounded bg-muted/30" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-border bg-card/40 p-5 space-y-3 ${pulse} ${tall ? "min-h-[260px]" : "min-h-[180px]"}`}
    >
      <div className="h-3 w-24 rounded bg-muted/50" />
      <div className="h-7 w-40 rounded bg-muted/70" />
      <div className="space-y-2 pt-2">
        <div className="h-2 w-full rounded bg-muted/30" />
        <div className="h-2 w-2/3 rounded bg-muted/30" />
      </div>
    </div>
  );
}

export function ListCardSkeleton() {
  return (
    <div
      className={`rounded-xl border border-border bg-card/40 p-5 space-y-3 ${pulse}`}
    >
      <div className="h-3 w-32 rounded bg-muted/50 mb-3" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 py-2 border-b border-border/40"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="size-8 rounded-md bg-muted/60 shrink-0" />
            <div className="space-y-1.5 min-w-0">
              <div className="h-3.5 w-32 rounded bg-muted/60" />
              <div className="h-2.5 w-20 rounded bg-muted/40" />
            </div>
          </div>
          <div className="h-4 w-16 rounded bg-muted/60 shrink-0" />
        </div>
      ))}
    </div>
  );
}
