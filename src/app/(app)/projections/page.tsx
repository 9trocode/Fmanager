import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import {
  ProjectionChat,
  type ProjectionGoal,
} from "@/components/app/projection-chat";
import {
  getBaseCurrency,
  listBudgets,
  listFlows,
  listGrants,
  listSavingsGoals,
} from "@/lib/db/queries";
import { computeNetWorth } from "@/lib/aggregation";
import { getRate } from "@/lib/fx";
import {
  getPredictionSession,
  listPredictionSessions,
} from "@/lib/actions/predictions";

export default async function ProjectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const params = await searchParams;
  const requestedSessionId = Number(params.s);
  const validRequested = Number.isFinite(requestedSessionId)
    ? requestedSessionId
    : null;
  // Pull every independent read in one fan-out. baseCurrency was
  // serially awaited before computeNetWorth — splitting it out so
  // listGrants/listSavingsGoals/listBudgets/listFlows/listPredictionSessions
  // start in parallel, then computeNetWorth runs once baseCurrency
  // resolves (it's the only consumer that needs it).
  const [baseCurrency, grants, goals, budgets, flows, sessions] =
    await Promise.all([
      getBaseCurrency(),
      listGrants(),
      listSavingsGoals(),
      listBudgets(),
      listFlows(),
      listPredictionSessions(),
    ]);
  const summary = await computeNetWorth(baseCurrency);
  const activeSessionId = validRequested ?? sessions[0]?.id ?? null;
  const activeSession =
    activeSessionId != null
      ? await getPredictionSession(activeSessionId)
      : null;

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
            Math.round(
              (t.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30),
            ),
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
        title="Predict"
        description="Ask anything — what-ifs, paths to a goal, scenarios with raises or expense cuts. The advisor reads your real balance sheet and proposes concrete edits you can apply."
      />

      {!summary.hasData ? (
        <EmptyState
          icon={TrendingUp}
          title="Add data first"
          description="Predictions start from your current net worth. Add an account or equity grant to get started."
        />
      ) : (
        <ProjectionChat
          key={activeSessionId ?? "new"}
          baseCurrency={baseCurrency}
          startNonGrantInBase={startNonGrant}
          grants={grants}
          fxToBase={fxToBase}
          goals={projectionGoals}
          budgetEntities={budgets.map((b) => ({
            id: b.id,
            category: b.category,
            monthlyLimit: b.monthlyLimit,
            currency: b.currency,
          }))}
          flowEntities={flows.map((f) => ({
            id: f.id,
            name: f.name,
            kind: f.kind,
            amount: f.amount,
            currency: f.currency,
            cadence: f.cadence,
          }))}
          initialSessionId={activeSessionId}
          initialMessages={activeSession?.messages ?? []}
          sessions={sessions}
        />
      )}
    </>
  );
}
