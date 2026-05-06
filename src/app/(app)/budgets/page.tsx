import { PageHeader } from "@/components/app/page-header";
import { BudgetsManager } from "@/components/app/budgets-manager";
import { getBaseCurrency } from "@/lib/db/queries";
import { computeBudgetStatus } from "@/lib/aggregation";

export default async function BudgetsPage() {
  const baseCurrency = await getBaseCurrency();
  const summary = await computeBudgetStatus(baseCurrency);

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
      />
    </>
  );
}
