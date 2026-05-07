import { PageHeader } from "@/components/app/page-header";
import { BudgetsManager } from "@/components/app/budgets-manager";
import { getBaseCurrency } from "@/lib/db/queries";
import {
  computeBudgetStatus,
  computeCashRunway,
  computeMonthlyCashFlow,
} from "@/lib/aggregation";

export default async function BudgetsPage() {
  const baseCurrency = await getBaseCurrency();
  const [summary, cashFlow, runway] = await Promise.all([
    computeBudgetStatus(baseCurrency),
    computeMonthlyCashFlow(baseCurrency),
    computeCashRunway(baseCurrency),
  ]);

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
        liquidCash={runway.liquidCash}
        monthsRunway={runway.monthsRunway}
      />
    </>
  );
}
