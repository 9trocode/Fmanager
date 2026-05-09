import { PageHeader } from "@/components/app/page-header";
import { BudgetsManager } from "@/components/app/budgets-manager";
import {
  getBaseCurrency,
  listAccounts,
  listTransactions,
} from "@/lib/db/queries";
import {
  computeBudgetStatus,
  computeCashRunway,
  computeMonthlyCashFlow,
} from "@/lib/aggregation";
import { prefetchRates } from "@/lib/fx";
import { localToday } from "@/lib/dates";
import { resolveMonthKey } from "@/lib/month-filter";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const params = await searchParams;
  const monthKey = await resolveMonthKey(params.m);
  const baseCurrency = await getBaseCurrency();

  // Resolve the month boundaries from the query param if present, else
  // current month. Used both for the aggregator call and for the local
  // listTransactions query (we want the actual rows for the bucketing
  // step below — not just the aggregate).
  const today = localToday();
  const fallback = today.split("-").map(Number);
  const [y, m] = (() => {
    if (monthKey && /^(\d{4})-(\d{2})$/.test(monthKey)) {
      const [yk, mk] = monthKey.split("-").map(Number);
      return [yk, mk];
    }
    return [fallback[0], fallback[1]];
  })();
  const monthFrom = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthTo = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [summary, cashFlow, runway, monthExpenses, accounts] =
    await Promise.all([
      computeBudgetStatus(baseCurrency, monthKey),
      computeMonthlyCashFlow(baseCurrency),
      computeCashRunway(baseCurrency),
      listTransactions({
        kind: "expense",
        dateFrom: monthFrom,
        dateTo: monthTo,
      }),
      listAccounts(),
    ]);
  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));

  // Split MTD expenses into "covered by a budget" vs "one-time / unbudgeted".
  // - In-budget spend is already reflected in `summary.totalSpent`, so the
  //   panel doesn't need to re-add it.
  // - Out-of-budget spend (different category or no category) is the
  //   slice that was previously invisible and that the user wants
  //   subtracted from "free" cash this month.
  const budgetedCategoriesLower = new Set(
    summary.rows.map((r) => r.category.trim().toLowerCase()),
  );
  // Prefetch every (txCcy → base) rate up front so the loop below
  // is sync. Was a per-tx awaited convert() — sequential despite
  // the cache.
  const oneTimeRates = await prefetchRates(
    monthExpenses.map((t) => [t.currency, baseCurrency] as const),
  );
  let oneTimeExpenses = 0;
  for (const t of monthExpenses) {
    const cat = (t.category ?? "").trim().toLowerCase();
    if (cat && budgetedCategoriesLower.has(cat)) continue;
    oneTimeExpenses += oneTimeRates.convert(
      t.amount,
      t.currency,
      baseCurrency,
    );
  }

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Per-category monthly spending limits. Spend resets each month — caps carry over as the skeleton. Use the month filter in the sidebar to scrub backward."
      />
      <BudgetsManager
        baseCurrency={baseCurrency}
        rows={summary.rows}
        totalLimit={summary.totalLimit}
        totalSpent={summary.totalSpent}
        monthlyIncome={cashFlow.income}
        recurringByCategory={cashFlow.byCategory.expense}
        oneTimeExpensesThisMonth={oneTimeExpenses}
        liquidCash={runway.liquidCash}
        monthsRunway={runway.monthsRunway}
        accountOptions={accountOptions}
      />
    </>
  );
}
