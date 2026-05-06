import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ProjectionsExplorer } from "@/components/app/projections-explorer";
import { getBaseCurrency, listGrants } from "@/lib/db/queries";
import { computeNetWorth } from "@/lib/aggregation";
import { getRate } from "@/lib/fx";

export default async function ProjectionsPage() {
  const baseCurrency = await getBaseCurrency();
  const summary = await computeNetWorth(baseCurrency);
  const grants = await listGrants();

  const uniqueCurrencies = Array.from(new Set(grants.map((g) => g.currency)));
  const fxToBase: Record<string, number> = {};
  for (const c of uniqueCurrencies) {
    fxToBase[c] = await getRate(c, baseCurrency);
  }

  const startGrantsInBase = summary.byCategory.liquid.grant; // current base-converted liquid grant total
  const startNonGrant = summary.totals.liquid - startGrantsInBase;

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
        />
      )}
    </>
  );
}
