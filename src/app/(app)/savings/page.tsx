import Link from "next/link";
import {
  Coins,
  ChevronRight,
  Flame,
  Landmark,
  PiggyBank,
  TrendingDown,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AddSavingsGoalDialog } from "@/components/app/add-savings-goal-dialog";
import { HeroBackground } from "@/components/app/hero-background";
import {
  getBaseCurrency,
  listAccounts,
  listSavingsGoals,
} from "@/lib/db/queries";
import { formatMoney } from "@/lib/format";
import {
  GOAL_KIND_BADGE,
  computeGoalState,
  type Goal,
  type GoalState,
} from "@/lib/goals";
import type { GoalKind } from "@/lib/db/schema";

const KIND_ICON: Record<
  GoalKind,
  React.ComponentType<{ className?: string }>
> = {
  savings: PiggyBank,
  net_worth: Coins,
  fire: Flame,
  debt_payoff: TrendingDown,
};

const KIND_TINT: Record<GoalKind, string> = {
  savings: "bg-primary/15 text-primary",
  net_worth: "bg-emerald-500/15 text-emerald-300",
  fire: "bg-amber-500/15 text-amber-300",
  debt_payoff: "bg-destructive/15 text-destructive",
};

function barColor(percent: number, kind: GoalKind): string {
  if (kind === "debt_payoff") {
    if (percent >= 100) return "bg-emerald-400";
    return "bg-emerald-500/70";
  }
  if (percent >= 100) return "bg-emerald-400";
  if (percent >= 60) return "bg-primary";
  return "bg-primary/70";
}

function etaLabel(state: GoalState): string {
  if (state.done) return "→ goal reached";
  if (state.etaMonths == null) return "→ no ETA at current pace";
  if (state.etaMonths <= 0) return "→ already there";
  if (state.etaMonths >= 600) return "→ 50+ years";
  if (state.etaMonths >= 24)
    return `→ ~${(state.etaMonths / 12).toFixed(1)} years to go`;
  return `→ ~${state.etaMonths} months to go`;
}

export default async function GoalsPage() {
  const baseCurrency = await getBaseCurrency();
  const [goals, accounts] = await Promise.all([
    listSavingsGoals({ includeArchived: true }),
    listAccounts(),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
  }));

  const activeGoals = goals.filter((g) => !g.archived);
  const archivedGoals = goals.filter((g) => g.archived);

  // Compute live state for each active goal in parallel.
  const states = await Promise.all(
    activeGoals.map((g) => computeGoalState(g as Goal, baseCurrency)),
  );

  return (
    <>
      <HeroBackground />
      <PageHeader
        size="lg"
        title="Goals"
        description="What you're working toward — savings targets, net worth milestones, financial independence, and debt payoff. Each tracked against your real balance sheet."
        actions={<AddSavingsGoalDialog accountOptions={accountOptions} />}
      />

      {states.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No goals yet"
          description="Add a savings target, a net worth milestone, your FIRE number, or a debt-payoff goal. They all show up in one place."
          action={<AddSavingsGoalDialog accountOptions={accountOptions} />}
        />
      ) : (
        <div className="grid gap-3">
          {states.map((state) => {
            const g = state.goal;
            const Icon = KIND_ICON[g.kind];
            const widthPct = Math.max(0, Math.min(100, state.percent));
            return (
              <Link
                key={g.id}
                href={`/savings/${g.id}`}
                className="block group"
              >
                <Card className="transition-colors hover:bg-secondary/40">
                  <CardHeader className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={
                            "size-10 rounded-lg grid place-items-center shrink-0 " +
                            KIND_TINT[g.kind]
                          }
                        >
                          <Icon className="size-5" />
                        </div>
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] uppercase tracking-wide"
                            >
                              {GOAL_KIND_BADGE[g.kind]}
                            </Badge>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {g.currency}
                            </span>
                            {g.targetDate ? (
                              <span className="text-[11px] text-muted-foreground">
                                · target {g.targetDate}
                              </span>
                            ) : null}
                          </div>
                          <CardTitle className="text-base truncate">
                            {g.name}
                          </CardTitle>
                          <CardDescription className="text-xs font-mono">
                            {formatMoney(state.current, g.currency, {
                              compact: true,
                            })}
                            {state.target != null
                              ? ` of ${formatMoney(state.target, g.currency, {
                                  compact: true,
                                })}`
                              : ""}
                          </CardDescription>
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 mt-1" />
                    </div>

                    {state.target != null ? (
                      <div className="mt-3 space-y-1.5">
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={"h-full " + barColor(state.percent, g.kind)}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                          <span>{state.percent.toFixed(0)}%</span>
                          <span>{etaLabel(state)}</span>
                        </div>
                      </div>
                    ) : null}
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {archivedGoals.length > 0 ? (
        <div className="mt-10 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Archived
          </h2>
          <div className="grid gap-2">
            {archivedGoals.map((g) => {
              const Icon = KIND_ICON[g.kind as GoalKind] ?? Landmark;
              return (
                <Link key={g.id} href={`/savings/${g.id}`} className="block">
                  <Card className="opacity-60 hover:opacity-100 transition-opacity">
                    <CardHeader className="py-3 flex flex-row items-center gap-3">
                      <Icon className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <span>{g.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            archived
                          </Badge>
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {GOAL_KIND_BADGE[g.kind as GoalKind]} · {g.currency}
                        </CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
