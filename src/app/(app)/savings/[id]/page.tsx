import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/app/page-header";
import { EditSavingsGoalDialog } from "@/components/app/edit-savings-goal-dialog";
import { SavingsProjectionChart } from "@/components/app/savings-projection-chart";
import { GoalNuggets } from "@/components/app/goal-nuggets";
import {
  archiveSavingsGoal,
  deleteSavingsGoal,
  unarchiveSavingsGoal,
} from "@/lib/actions/savings";
import {
  getAccount,
  getBaseCurrency,
  getSavingsGoal,
  listAccounts,
  listGrants,
} from "@/lib/db/queries";
import { computeNetWorth } from "@/lib/aggregation";
import { getRate } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import {
  monthsToTarget,
  progressPct,
  projectedEndValue,
  addMonths,
} from "@/lib/savings";
import { projectNetWorth } from "@/lib/projections";

export default async function SavingsGoalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  // Pull the goal + base currency in parallel — computeNetWorth needs
  // baseCurrency, so it sequences after, but everything else fans out.
  // Was: computeNetWorth(await getBaseCurrency()) inside a sibling
  // Promise.all — the inner await blocked the array from kicking off.
  const [goal, baseCurrency] = await Promise.all([
    getSavingsGoal(id),
    getBaseCurrency(),
  ]);
  if (!goal) notFound();

  const [accounts, summary, grants, linkedAccount] = await Promise.all([
    listAccounts({ includeArchived: false }),
    computeNetWorth(baseCurrency),
    listGrants(),
    goal.accountId ? getAccount(goal.accountId) : null,
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
  }));

  // Net worth projection at the goal's horizon, using the goal's monthly
  // contribution as the savings input (in base currency).
  const goalToBase = await getRate(goal.currency, baseCurrency);
  const monthlyInBase = goal.monthlyContribution * goalToBase;

  const uniqueGrantCurrencies = Array.from(
    new Set(grants.map((g) => g.currency)),
  );
  const fxToBase: Record<string, number> = {};
  for (const c of uniqueGrantCurrencies) {
    fxToBase[c] = await getRate(c, baseCurrency);
  }
  const startGrantsInBase = summary.byCategory.liquid.grant;
  const startNonGrant = summary.totals.liquid - startGrantsInBase;

  const nwProjection = projectNetWorth(
    startNonGrant,
    grants,
    fxToBase,
    {
      monthlyContribution: monthlyInBase,
      annualReturnPct: goal.expectedReturnPct,
      horizonMonths: goal.horizonMonths,
    },
  );
  const nwAtEnd = nwProjection[nwProjection.length - 1];

  const pct = progressPct(goal);
  const months = monthsToTarget(goal);
  const endValue = projectedEndValue(goal);
  const completionDate = addMonths(
    new Date(goal.startedAt),
    goal.horizonMonths,
  );
  const remaining = goal.targetAmount != null ? goal.targetAmount - endValue : null;

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/savings">
            <ArrowLeft className="size-4" />
            All goals
          </Link>
        </Button>
      </div>

      <PageHeader
        title={goal.name}
        description={
          goal.category
            ? `${goal.category} · ${goal.currency} · ${goal.horizonMonths} mo`
            : `${goal.currency} · ${goal.horizonMonths} mo`
        }
        actions={
          <>
            <EditSavingsGoalDialog goal={goal} accountOptions={accountOptions} />
            {goal.archived ? (
              <form action={unarchiveSavingsGoal}>
                <input type="hidden" name="id" value={goal.id} />
                <Button type="submit" variant="outline" size="sm">
                  <ArchiveRestore className="size-4" />
                  Unarchive
                </Button>
              </form>
            ) : (
              <form action={archiveSavingsGoal}>
                <input type="hidden" name="id" value={goal.id} />
                <Button type="submit" variant="outline" size="sm">
                  <Archive className="size-4" />
                  Archive
                </Button>
              </form>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanent. Archive instead if you want to keep history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <form action={deleteSavingsGoal}>
                    <input type="hidden" name="id" value={goal.id} />
                    <AlertDialogAction
                      type="submit"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardDescription>Saved so far</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums mt-1">
              {formatMoney(goal.currentAmount, goal.currency)}
              {goal.targetAmount != null ? (
                <span className="text-base text-muted-foreground font-normal">
                  {" "}
                  of {formatMoney(goal.targetAmount, goal.currency)}
                </span>
              ) : null}
            </CardTitle>
            {goal.targetAmount != null ? (
              <div className="mt-3 space-y-1.5">
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={pct >= 100 ? "h-full bg-emerald-400" : "h-full bg-primary"}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <span>{pct.toFixed(0)}% saved</span>
                  <span>
                    {months == null
                      ? "never at this rate"
                      : months === 0
                        ? "target reached"
                        : `~${months} mo to target`}
                  </span>
                </div>
              </div>
            ) : null}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>At end of horizon</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums mt-1">
              {formatMoney(endValue, goal.currency)}
            </CardTitle>
            <CardDescription className="font-mono text-xs mt-1">
              {completionDate.toISOString().slice(0, 10)} · {goal.expectedReturnPct}%/yr
            </CardDescription>
          </CardHeader>
          <CardContent className="border-t border-border pt-3 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Contributions:</span>
              <span className="font-mono tabular-nums">
                {formatMoney(
                  goal.monthlyContribution * goal.horizonMonths,
                  goal.currency,
                  { compact: true },
                )}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Growth:</span>
              <span className="font-mono tabular-nums">
                {formatMoney(
                  endValue -
                    goal.currentAmount -
                    goal.monthlyContribution * goal.horizonMonths,
                  goal.currency,
                  { compact: true },
                )}
              </span>
            </div>
            {remaining != null ? (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">vs target:</span>
                <span
                  className={
                    "font-mono tabular-nums " +
                    (remaining > 0 ? "text-destructive" : "text-emerald-300")
                  }
                >
                  {formatMoney(-remaining, goal.currency, {
                    compact: true,
                    signed: true,
                  })}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Goal projection</CardTitle>
          <CardDescription>
            Projected balance over {goal.horizonMonths} months. Grows from{" "}
            {formatMoney(goal.currentAmount, goal.currency, { compact: true })}{" "}
            with {formatMoney(goal.monthlyContribution, goal.currency, { compact: true })}/mo
            at {goal.expectedReturnPct}%/yr blended.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SavingsProjectionChart goal={goal} currency={goal.currency} />
        </CardContent>
      </Card>

      <div className="mb-6">
        <GoalNuggets goalId={goal.id} />
      </div>

      {nwAtEnd ? (
        <Card className="mb-6">
          <CardHeader>
            <CardDescription>
              Where you&apos;ll be in {goal.horizonMonths} months
            </CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums mt-1">
              {formatMoney(nwAtEnd.floor, baseCurrency)}
              <span
                className={
                  "ml-3 text-sm font-mono align-middle " +
                  (nwAtEnd.floor - summary.totals.floor >= 0
                    ? "text-emerald-300"
                    : "text-destructive")
                }
              >
                {formatMoney(
                  nwAtEnd.floor - summary.totals.floor,
                  baseCurrency,
                  { compact: true, signed: true },
                )}
              </span>
            </CardTitle>
            <CardDescription>
              {grants.length > 0
                ? `Total personal net worth, assuming your company equity is worth nothing (the safest plan). Today: ${formatMoney(summary.totals.floor, baseCurrency)}.`
                : `Total personal net worth at the goal horizon. Today: ${formatMoney(summary.totals.floor, baseCurrency)}.`}
            </CardDescription>
          </CardHeader>
          {/*
            Equity-included disclosure is only useful when there's
            actually equity to add — otherwise the three scenarios all
            equal the floor and the section just adds noise. Hide it
            entirely when no grants exist; show it when at least one
            grant is tracked.
          */}
          {grants.length > 0 ? (
            <CardContent className="border-t border-border pt-4">
              <details className="group text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                  Show with company equity included
                </summary>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      With equity at today&apos;s value
                    </div>
                    <div className="font-mono tabular-nums">
                      {formatMoney(nwAtEnd.liquid, baseCurrency, {
                        compact: true,
                      })}
                    </div>
                    <div
                      className={
                        "text-[11px] font-mono tabular-nums " +
                        (nwAtEnd.liquid - summary.totals.liquid >= 0
                          ? "text-emerald-300"
                          : "text-destructive")
                      }
                    >
                      {formatMoney(
                        nwAtEnd.liquid - summary.totals.liquid,
                        baseCurrency,
                        { compact: true, signed: true },
                      )}
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      If equity hits target exit
                    </div>
                    <div className="font-mono tabular-nums">
                      {formatMoney(nwAtEnd.expected, baseCurrency, {
                        compact: true,
                      })}
                    </div>
                    <div
                      className={
                        "text-[11px] font-mono tabular-nums " +
                        (nwAtEnd.expected - summary.totals.expected >= 0
                          ? "text-emerald-300"
                          : "text-destructive")
                      }
                    >
                      {formatMoney(
                        nwAtEnd.expected - summary.totals.expected,
                        baseCurrency,
                        { compact: true, signed: true },
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                  These two numbers depend on outcomes you don&apos;t fully
                  control — equity is paper until it&apos;s liquid, and could
                  end up worth zero. Plan against the big number above; treat
                  these as upside.
                </p>
              </details>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Goal details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {[
            { label: "Started", value: goal.startedAt },
            { label: "Length", value: `${goal.horizonMonths} mo` },
            {
              label: "Monthly",
              value: formatMoney(goal.monthlyContribution, goal.currency),
            },
            {
              label: "Expected return",
              value: `${goal.expectedReturnPct}%/yr`,
            },
            {
              label: "Linked account",
              value: linkedAccount ? linkedAccount.name : "—",
            },
            {
              label: "Completion date",
              value: completionDate.toISOString().slice(0, 10),
            },
          ].map((row) => (
            <div key={row.label} className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {row.label}
              </div>
              <div className="font-mono tabular-nums">{row.value}</div>
            </div>
          ))}
        </CardContent>
        {goal.notes ? (
          <CardContent className="border-t border-border pt-4">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Description
            </div>
            <p className="text-sm whitespace-pre-wrap">{goal.notes}</p>
          </CardContent>
        ) : (
          <CardContent className="border-t border-border pt-4 text-[12px] text-muted-foreground/80">
            No description yet. Edit the goal to add one — the advisor
            uses it for the &quot;Worth knowing&quot; nuggets below
            (why this matters, deadlines, what hitting it unlocks).
          </CardContent>
        )}
      </Card>
    </>
  );
}
