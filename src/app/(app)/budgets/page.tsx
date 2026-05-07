import { PageHeader } from "@/components/app/page-header";
import { BudgetsManager } from "@/components/app/budgets-manager";
import { getBaseCurrency, listTransactions } from "@/lib/db/queries";
import {
  computeBudgetStatus,
  computeCashRunway,
  computeMonthlyCashFlow,
} from "@/lib/aggregation";
import { convert } from "@/lib/fx";
import { localToday } from "@/lib/dates";

export default async function BudgetsPage() {
  const baseCurrency = await getBaseCurrency();

  // Calendar-month range, local TZ. Same shape `currentMonthRange()` uses
  // inside aggregation; duplicated here so we can keep this page's query
  // concrete (we want the actual transactions, not just the aggregate).
  const today = localToday();
  const [y, m] = today.split("-").map(Number);
  const monthFrom = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const monthTo = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [summary, cashFlow, runway, monthExpenses] = await Promise.all([
    computeBudgetStatus(baseCurrency),
    computeMonthlyCashFlow(baseCurrency),
    computeCashRunway(baseCurrency),
    listTransactions({
      kind: "expense",
      dateFrom: monthFrom,
      dateTo: monthTo,
    }),
  ]);

  // Split MTD expenses into "covered by a budget" vs "one-time / unbudgeted".
  // - In-budget spend is already reflected in `summary.totalSpent`, so the
  //   panel doesn't need to re-add it.
  // - Out-of-budget spend (different category or no category) is the
  //   slice that was previously invisible and that the user wants
  //   subtracted from "free" cash this month.
  const budgetedCategoriesLower = new Set(
    summary.rows.map((r) => r.category.trim().toLowerCase()),
  );
  let oneTimeExpenses = 0;
  for (const t of monthExpenses) {
    const cat = (t.category ?? "").trim().toLowerCase();
    if (cat && budgetedCategoriesLower.has(cat)) continue;
    oneTimeExpenses += await convert(t.amount, t.currency, baseCurrency);
  }

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Per-category monthly spending limits. Actuals come from your transactions for the current calendar month."
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
      />
    </>
  );
}
