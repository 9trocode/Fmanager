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
import {
  computeMonthlyCashFlow,
  computeThisMonthActuals,
} from "@/lib/aggregation";
import { resolveMonthKey } from "@/lib/month-filter";
import { localYmd } from "@/lib/dates";

export default async function CashFlowPage() {
  // Run base currency + month resolution in parallel — both touch
  // independent state (DB vs cookie).
  const [baseCurrency, monthKey] = await Promise.all([
    getBaseCurrency(),
    resolveMonthKey(undefined),
  ]);

  // If the global month filter is set (sidebar), narrow the "Recent
  // one-time" list to that calendar month. Otherwise fall back to the
  // last 30 days. Future months have no transactions yet — skip the
  // query and show an empty list so the page becomes a pure forecast.
  let monthLabel: string | null = null;
  let isFuture = false;
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
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    isFuture = monthKey > currentKey;
    recentTxsPromise = isFuture
      ? (Promise.resolve([]) as Promise<
          Awaited<ReturnType<typeof listRecentTransactions>>
        >)
      : (listTransactions({
          dateFrom: start,
          dateTo: end,
        }) as Promise<Awaited<ReturnType<typeof listRecentTransactions>>>);
  } else {
    recentTxsPromise = listRecentTransactions(30);
  }

  // Two flavors of "monthly cash flow":
  //   - PROJECTED: sum of recurring-flow templates ("what to expect every
  //     month given my setup"). Always relevant; computed in base currency.
  //   - ACTUAL  : sum of real transactions in a given month, also in base.
  //
  // When the user filters to a past month, "actuals for that month" is
  // what they want to see in the summary card — the projection is the
  // same shape regardless of month, so showing it for March 2025 would
  // be misleading. For the current month with no filter, the projection
  // is the right starting point — it's what you SHOULD be tracking
  // toward, even if the month isn't fully realized yet.
  const [flows, projected, accounts, recentTxs, budgets, monthActuals] =
    await Promise.all([
      listFlows({ includeArchived: true }),
      computeMonthlyCashFlow(baseCurrency),
      listAccounts(),
      recentTxsPromise,
      listBudgets(),
      monthKey && !isFuture
        ? computeThisMonthActuals(baseCurrency, monthKey)
        : null,
    ]);
  // Past month → actuals. Future month → projection (forecast). Current
  // month / no filter → projection (the starting point you should be
  // tracking toward).
  const summary = monthActuals
    ? {
        baseCurrency,
        income: monthActuals.income,
        expenses: monthActuals.expenses,
        net: monthActuals.net,
        byCategory: { income: {}, expense: {} },
      }
    : projected;

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
    ? isFuture
      ? `Forecast for ${monthLabel} — based on your current recurring flows. Want to model a raise, a new subscription, or a one-off bill in that month? Edit a flow below (its monthly total changes everywhere this month is shown) or use Predict for full what-if scenarios.`
      : `Showing ${monthLabel} actuals — income, expenses, and net come from transactions in that month. The recurring flows section below stays the same (templates aren't time-scoped). Switch back to the current month in the sidebar for projected numbers.`
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
