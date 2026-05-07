import { PageHeader } from "@/components/app/page-header";
import { HeroBackground } from "@/components/app/hero-background";
import { FlowsManager } from "@/components/app/flows-manager";
import {
  getBaseCurrency,
  listAccounts,
  listFlows,
} from "@/lib/db/queries";
import { computeMonthlyCashFlow } from "@/lib/aggregation";

export default async function CashFlowPage() {
  const baseCurrency = await getBaseCurrency();
  const [flows, summary, accounts] = await Promise.all([
    listFlows({ includeArchived: true }),
    computeMonthlyCashFlow(baseCurrency),
    listAccounts(),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
  }));

  return (
    <>
      <HeroBackground />
      <PageHeader
        size="lg"
        title="Cash flow"
        description="Recurring inflows and outflows shape your monthly take. One-time expenses (a vacation, a tax bill) live in transactions and still affect your runway — log them from here too."
      />
      <FlowsManager
        flows={flows}
        baseCurrency={baseCurrency}
        monthlyIncomeInBase={summary.income}
        monthlyExpensesInBase={summary.expenses}
        accountOptions={accountOptions}
      />
    </>
  );
}
