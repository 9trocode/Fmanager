import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ProjectionsExplorer } from "@/components/app/projections-explorer";
import { getBaseCurrency, listGrants } from "@/lib/db/queries";
import { computeNetWorth, computeMonthlyCashFlow } from "@/lib/aggregation";
import { getRate } from "@/lib/fx";

export default async function ProjectionsPage() {
  const baseCurrency = await getBaseCurrency();
  const [summary, grants, cashFlow] = await Promise.all([
    computeNetWorth(baseCurrency),
    listGrants(),
    computeMonthlyCashFlow(baseCurrency),
  ]);

  const uniqueCurrencies = Array.from(new Set(grants.map((g) => g.currency)));
  const fxToBase: Record<string, number> = {};
  for (const c of uniqueCurrencies) {
    const rate = await getRate(c, baseCurrency);
    fxToBase[c] = Number.isFinite(rate) ? rate : 1;
  }

  const startGrantsInBase = Number.isFinite(summary.byCategory.liquid.grant)
    ? summary.byCategory.liquid.grant
    : 0;
  const liquidTotal = Number.isFinite(summary.totals.liquid)
    ? summary.totals.liquid
    : 0;
  const startNonGrant = liquidTotal - startGrantsInBase;
  const safeDefaultContribution = Number.isFinite(cashFlow.net)
    ? Math.round(cashFlow.net)
    : 0;

  return (
    <>
      <PageHeader
        title="Projections"
        description="If I save $X/month at Y% return for N months, what's my net worth in each scenario?"
      />

      {!summary.hasData ? (
        <EmptyState
          icon={TrendingUp}
          title="Add data first"
          description="Projections start from your current net worth. Add an account or equity grant to see scenarios."
        />
      ) : (
        <ProjectionsExplorer
          baseCurrency={baseCurrency}
          startNonGrantInBase={startNonGrant}
          grants={grants}
          fxToBase={fxToBase}
          defaultMonthlyContribution={safeDefaultContribution}
        />
      )}
    </>
  );
}
