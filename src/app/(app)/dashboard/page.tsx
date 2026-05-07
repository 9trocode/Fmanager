import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { HeroBackground } from "@/components/app/hero-background";
import { resolveMonthKey } from "@/lib/month-filter";

// Reads onboarding state + auth cookie + DB live every request.
// Must NOT be statically prerendered, or the build-time snapshot
// (no onboarding_complete) gets cached and always redirects.
export const dynamic = "force-dynamic";
import { EmptyState } from "@/components/app/empty-state";
import { AddAccountDialog } from "@/components/app/add-account-dialog";
import { AddGrantDialog } from "@/components/app/add-grant-dialog";
import { RunwayCard } from "@/components/app/runway-card";
import { BudgetsSummaryCard } from "@/components/app/budgets-summary-card";
import { MonthStatsRow } from "@/components/app/month-stats-row";
import { RecentTransactionsCard } from "@/components/app/recent-transactions-card";
import { SavingsSummaryCard } from "@/components/app/savings-summary-card";
import { NetWorthMiniCard } from "@/components/app/networth-mini-card";
import {
  getBaseCurrency,
  getSetting,
  listAccounts,
  listLatestTransactions,
  listSavingsGoals,
} from "@/lib/db/queries";
import {
  computeNetWorth,
  computeCashRunway,
  computeBudgetStatus,
  computeMonthlyCashFlow,
  computeThisMonthActuals,
} from "@/lib/aggregation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  // Send first-time users into onboarding instead of an empty dashboard.
  const onboardingComplete =
    (await getSetting("onboarding_complete")) === "true";
  if (!onboardingComplete) {
    redirect("/welcome");
  }

  const params = await searchParams;
  const monthKey = await resolveMonthKey(params.m);

  const baseCurrency = await getBaseCurrency();
  const [
    summary,
    runway,
    budgets,
    month,
    flows,
    accounts,
    recentTxs,
    savings,
  ] = await Promise.all([
    computeNetWorth(baseCurrency),
    computeCashRunway(baseCurrency),
    computeBudgetStatus(baseCurrency, monthKey),
    computeThisMonthActuals(baseCurrency, monthKey),
    computeMonthlyCashFlow(baseCurrency),
    listAccounts({ includeArchived: true }),
    listLatestTransactions(8),
    listSavingsGoals(),
  ]);

  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <HeroBackground />
      <PageHeader
        size="lg"
        title="Home"
        description={`Where your money's going in ${month.monthLabel}.`}
      />

      {!summary.hasData ? (
        <EmptyState
          icon={Wallet}
          title="Empty house"
          description="Add an account, a recurring expense, or a transaction to bring this page to life."
          action={
            <div className="flex gap-2">
              <AddAccountDialog />
              <AddGrantDialog />
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <MonthStatsRow month={month} budgets={budgets} flows={flows} />

          <div className="grid lg:grid-cols-2 gap-6">
            <RunwayCard runway={runway} />
            <BudgetsSummaryCard summary={budgets} />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <SavingsSummaryCard goals={savings} />
            <RecentTransactionsCard
              txs={recentTxs}
              accountNameById={accountNameById}
            />
          </div>

          <NetWorthMiniCard summary={summary} />
        </div>
      )}
    </>
  );
}
