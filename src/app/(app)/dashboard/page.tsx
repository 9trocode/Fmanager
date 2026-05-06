import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
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
  listAccounts,
  listLatestTransactions,
  listSavingsGoals,
} from "@/lib/db/queries";
import {
  computeNetWorth,
  computeCashRunway,
  computeBudgetStatus,
  computeThisMonthActuals,
} from "@/lib/aggregation";

export default async function DashboardPage() {
  const baseCurrency = await getBaseCurrency();
  const [
    summary,
    runway,
    budgets,
    month,
    accounts,
    recentTxs,
    savings,
  ] = await Promise.all([
    computeNetWorth(baseCurrency),
    computeCashRunway(baseCurrency),
    computeBudgetStatus(baseCurrency),
    computeThisMonthActuals(baseCurrency),
    listAccounts({ includeArchived: true }),
    listLatestTransactions(8),
    listSavingsGoals(),
  ]);

  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <>
      <PageHeader
        title="Home"
        description={`Where your money is going in ${month.monthLabel}. Add transactions, watch budgets, work toward goals.`}
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
          <MonthStatsRow month={month} budgets={budgets} />

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
