import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import {
  ProjectionsExplorer,
  type ProjectionGoal,
} from "@/components/app/projections-explorer";
import {
  getBaseCurrency,
  listGrants,
  listSavingsGoals,
} from "@/lib/db/queries";
import { computeNetWorth, computeMonthlyCashFlow } from "@/lib/aggregation";
import { getRate } from "@/lib/fx";
import { listSavedScenarios } from "@/lib/actions/saved-scenarios";

export default async function ProjectionsPage() {
  const baseCurrency = await getBaseCurrency();
  const [summary, grants, cashFlow, goals, savedScenarios] = await Promise.all([
    computeNetWorth(baseCurrency),
    listGrants(),
    computeMonthlyCashFlow(baseCurrency),
    listSavingsGoals(),
    listSavedScenarios(),
  ]);

  // Pre-resolve every (currency → base) FX rate the page will need:
  // grant currencies for the projection engine, and goal currencies for
  // the goal-target overlay. Done up front in one batch.
  const grantCurrencies = grants.map((g) => g.currency);
  const goalCurrencies = goals.map((g) => g.currency);
  const fxToBase: Record<string, number> = {};
  for (const c of new Set([...grantCurrencies, ...goalCurrencies])) {
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

  // debt_payoff goals "succeed" by driving an account balance to zero —
  // a horizontal target line at zero on a positive net-worth chart isn't
  // useful, so they're filtered out of the goal selector. Savings,
  // net_worth, and FIRE all map cleanly to a positive target line.
  const today = new Date();
  const projectionGoals: ProjectionGoal[] = goals
    .filter((g) => !g.archived && g.kind !== "debt_payoff")
    .map((g) => {
      const fx = fxToBase[g.currency] ?? 1;
      const targetInBase =
        g.targetAmount != null && Number.isFinite(g.targetAmount)
          ? g.targetAmount * fx
          : null;
      let monthsToTarget: number | null = null;
      if (g.targetDate) {
        const t = new Date(g.targetDate);
        if (!Number.isNaN(t.getTime())) {
          monthsToTarget = Math.max(
            0,
            Math.round((t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30)),
          );
        }
      }
      return {
        id: g.id,
        name: g.name,
        kind: g.kind,
        targetAmount: g.targetAmount,
        targetInBase,
        monthsToTarget,
      };
    });

  return (
    <>
      <PageHeader
        title="Projections"
        description="Compare scenarios side-by-side. Add a raise, an expense shock, or a lump sum — see how each path lands against your goal."
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
          goals={projectionGoals}
          savedScenarios={savedScenarios}
        />
      )}
    </>
  );
}
