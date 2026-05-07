import { PageHeader } from "@/components/app/page-header";
import { HeroBackground } from "@/components/app/hero-background";
import { FlowsManager } from "@/components/app/flows-manager";
import {
  getBaseCurrency,
  listAccounts,
  listFlows,
  listRecentTransactions,
  listTransactions,
  listBudgets,
} from "@/lib/db/queries";
import { computeMonthlyCashFlow } from "@/lib/aggregation";
import { resolveMonthKey } from "@/lib/month-filter";
import { localYmd } from "@/lib/dates";

export default async function CashFlowPage() {
  const baseCurrency = await getBaseCurrency();

  // If the global month filter is set (sidebar), narrow the "Recent
  // one-time" list to that calendar month. Otherwise fall back to the
  // last 30 days, which is what this page has always shown.
  const monthKey = await resolveMonthKey(undefined);
  let monthLabel: string | null = null;
  let recentTxsPromise: Promise<
    Awaited<ReturnType<typeof listRecentTransactions>>
  >;
  if (monthKey) {
    const [yStr, mStr] = monthKey.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const start = localYmd(new Date(y, m - 1, 1));
    const end = localYmd(new Date(y, m, 0));
    monthLabel = new Date(y, m - 1, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    recentTxsPromise = listTransactions({
      dateFrom: start,
      dateTo: end,
    }) as Promise<Awaited<ReturnType<typeof listRecentTransactions>>>;
  } else {
    recentTxsPromise = listRecentTransactions(30);
  }

  const [flows, summary, accounts, recentTxs, budgets] = await Promise.all([
    listFlows({ includeArchived: true }),
    computeMonthlyCashFlow(baseCurrency),
    listAccounts(),
    recentTxsPromise,
    listBudgets(),
  ]);

  // Map of category (lowercased) → matching budget. Used to surface a
  // "Maps to budget X" hint on each flow row whose category lines up
  // with an existing budget — that's how recurring expenses + budgets
  // tie together in the data model (budgets aggregate by category, and
  // accrued flow transactions inherit the flow's category).
  const budgetByCategory: Record<
    string,
    { id: number; category: string; currency: string }
  > = {};
  for (const b of budgets) {
    budgetByCategory[b.category.trim().toLowerCase()] = {
      id: b.id,
      category: b.category,
      currency: b.currency,
    };
  }

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
  }));

  const description = monthLabel
    ? `Recurring inflows and outflows shape your monthly take. One-time expenses (a vacation, a tax bill) live in transactions and still affect your runway — log them from here too. Recent one-time list scoped to ${monthLabel} via the sidebar's month filter.`
    : "Recurring inflows and outflows shape your monthly take. One-time expenses (a vacation, a tax bill) live in transactions and still affect your runway — log them from here too.";

  return (
    <>
      <HeroBackground />
      <PageHeader size="lg" title="Cash flow" description={description} />
      <FlowsManager
        flows={flows}
        baseCurrency={baseCurrency}
        monthlyIncomeInBase={summary.income}
        monthlyExpensesInBase={summary.expenses}
        accountOptions={accountOptions}
        recentTransactions={recentTxs}
        budgetByCategory={budgetByCategory}
      />
    </>
  );
}
