import { PageHeader } from "@/components/app/page-header";
import { FlowsManager } from "@/components/app/flows-manager";
import { getBaseCurrency, listFlows } from "@/lib/db/queries";
import { computeMonthlyCashFlow } from "@/lib/aggregation";

export default async function CashFlowPage() {
  const baseCurrency = await getBaseCurrency();
  const [flows, summary] = await Promise.all([
    listFlows({ includeArchived: true }),
    computeMonthlyCashFlow(baseCurrency),
  ]);

  return (
    <>
      <PageHeader
        title="Cash flow"
        description="Recurring inflows and outflows. The dashboard runway widget and projections use the net of these."
      />
      <FlowsManager
        flows={flows}
        baseCurrency={baseCurrency}
        monthlyIncomeInBase={summary.income}
        monthlyExpensesInBase={summary.expenses}
      />
    </>
  );
}
