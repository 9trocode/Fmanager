import { PageHeader } from "@/components/app/page-header";
import { HeroBackground } from "@/components/app/hero-background";
import { FlowsManager } from "@/components/app/flows-manager";
import {
  getBaseCurrency,
  listAccounts,
  listFlows,
  listRecentTransactions,
  listBudgets,
} from "@/lib/db/queries";
import { computeMonthlyCashFlow } from "@/lib/aggregation";

export default async function CashFlowPage() {
  const baseCurrency = await getBaseCurrency();
  // Pull recent transactions too so the manager can show a "Recent
  // one-time" list. Without it, clicking the "One-time" button saves the
  // transaction but the user sees nothing change on this page and assumes
  // the action didn't take.
  const [flows, summary, accounts, recentTxs, budgets] = await Promise.all([
    listFlows({ includeArchived: true }),
    computeMonthlyCashFlow(baseCurrency),
    listAccounts(),
    listRecentTransactions(30),
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
        recentTransactions={recentTxs}
        budgetByCategory={budgetByCategory}
      />
    </>
  );
}
