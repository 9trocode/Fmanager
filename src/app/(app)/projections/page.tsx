import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { ProjectionsExplorer } from "@/components/app/projections-explorer";
import { getBaseCurrency } from "@/lib/db/queries";
import { computeNetWorth } from "@/lib/aggregation";
import { listGrants } from "@/lib/db/queries";
import { equityValueForScenario, SCENARIOS } from "@/lib/scenarios";
import { convert } from "@/lib/fx";
import type { Scenario } from "@/lib/scenarios";

export default async function ProjectionsPage() {
  const baseCurrency = await getBaseCurrency();
  const summary = await computeNetWorth(baseCurrency);

  const grants = await listGrants();
  const startGrants: Record<Scenario, number> = { floor: 0, expected: 0, liquid: 0 };
  for (const g of grants) {
    for (const s of SCENARIOS) {
      const value = equityValueForScenario(g, s);
      const inBase = await convert(value, g.currency, baseCurrency);
      startGrants[s] += inBase;
    }
  }

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
          startTotals={summary.totals}
          startGrants={startGrants}
        />
      )}
    </>
  );
}
