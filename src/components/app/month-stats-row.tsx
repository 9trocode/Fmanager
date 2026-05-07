import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Equal } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type {
  MonthActuals,
  BudgetSummary,
  CashFlowSummary,
} from "@/lib/aggregation";

/**
 * Three-card row at the top of the dashboard.
 *
 * Two display modes:
 *   1. Recurring income IS configured → the planned monthly income is the
 *      headline number. "Net this month" becomes planned income − MTD
 *      spend (the user's real question is "with my expected $X coming in,
 *      am I in the black?"). MTD actual income is shown as a supplementary
 *      line for transparency.
 *   2. No recurring income configured → fall back to MTD-actuals on every
 *      card (the previous behavior). All three cards still reconcile
 *      arithmetically.
 *
 * Spent + budget progress are always MTD-actual (only spending answers
 * "are you on or off track?" — projecting expenses doesn't make sense).
 */
export function MonthStatsRow({
  month,
  budgets,
  flows,
}: {
  month: MonthActuals;
  budgets: BudgetSummary;
  flows: CashFlowSummary;
}) {
  const baseCurrency = month.baseCurrency;
  const overallBudgetPct =
    budgets.totalLimit > 0 ? (budgets.totalSpent / budgets.totalLimit) * 100 : 0;

  const spent = month.expenses;
  const mtdIncome = month.income;
  const recurringIncome = flows.income;
  const hasRecurringIncome = recurringIncome > 0;

  // Pick the income number to feature.
  // - If recurring income is configured, we treat THAT as the source of
  //   truth (matches user mental model: "I have $X coming in monthly").
  // - Otherwise, surface whatever's been logged this month.
  const displayedIncome = hasRecurringIncome ? recurringIncome : mtdIncome;
  const displayedNet = displayedIncome - spent;
  const netPositive = displayedNet >= 0;

  // Income progress: how much of the expected income has actually been
  // logged so far. Only shown when recurring income exists.
  const incomeProgressPct =
    hasRecurringIncome && recurringIncome > 0
      ? Math.min(100, (mtdIncome / recurringIncome) * 100)
      : 0;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ArrowDownRight className="size-3.5 text-destructive" />
            Spent this month
          </CardDescription>
          <CardTitle className="text-3xl font-mono tracking-tight mt-1 text-destructive">
            {formatMoney(spent, baseCurrency)}
          </CardTitle>
          {budgets.rows.length > 0 ? (
            <CardDescription className="font-mono text-[11px]">
              {formatMoney(budgets.totalSpent, baseCurrency, { compact: true })} of{" "}
              {formatMoney(budgets.totalLimit, baseCurrency, { compact: true })}{" "}
              budgeted ({overallBudgetPct.toFixed(0)}%)
            </CardDescription>
          ) : (
            <CardDescription className="text-[11px]">
              {month.txCount === 0
                ? "No transactions logged yet this month."
                : `${month.txCount} transactions this month.`}
            </CardDescription>
          )}
        </CardHeader>
        {budgets.rows.length > 0 ? (
          <CardContent className="border-t border-border pt-3">
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={
                  overallBudgetPct > 100
                    ? "h-full bg-destructive"
                    : overallBudgetPct >= 80
                      ? "h-full bg-amber-500"
                      : "h-full bg-emerald-500"
                }
                style={{ width: `${Math.min(100, overallBudgetPct)}%` }}
              />
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ArrowUpRight className="size-3.5 text-emerald-300" />
            {hasRecurringIncome ? "Income this month" : "Income (MTD)"}
          </CardDescription>
          <CardTitle className="text-3xl font-mono tracking-tight mt-1 text-emerald-300">
            {formatMoney(displayedIncome, baseCurrency)}
          </CardTitle>
          <CardDescription className="text-[11px]">
            {hasRecurringIncome
              ? "Planned monthly income from your recurring cash flows."
              : mtdIncome > 0
                ? "From transactions you've logged this month."
                : "Log income transactions or add a recurring inflow on cash flow."}
          </CardDescription>
        </CardHeader>
        {hasRecurringIncome ? (
          <CardContent className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground">
              <span>
                Received so far:{" "}
                <span className="text-foreground">
                  {formatMoney(mtdIncome, baseCurrency, { compact: true })}
                </span>
              </span>
              <span>{incomeProgressPct.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-emerald-500/70"
                style={{ width: `${incomeProgressPct}%` }}
              />
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <Equal className="size-3.5 text-muted-foreground" />
            Net this month
          </CardDescription>
          <CardTitle
            className={
              "text-3xl font-mono tracking-tight mt-1 " +
              (netPositive ? "text-emerald-300" : "text-destructive")
            }
          >
            {formatMoney(displayedNet, baseCurrency, { signed: true })}
          </CardTitle>
          <CardDescription className="text-[11px]">
            {hasRecurringIncome
              ? "Planned monthly income minus everything spent so far this month."
              : "Income minus spending, this month so far."}
          </CardDescription>
        </CardHeader>
        {hasRecurringIncome ? (
          <CardContent className="border-t border-border pt-3 text-[11px] font-mono text-muted-foreground">
            MTD actual:{" "}
            <span
              className={
                mtdIncome - spent >= 0 ? "text-emerald-300" : "text-destructive"
              }
            >
              {formatMoney(mtdIncome - spent, baseCurrency, {
                signed: true,
                compact: true,
              })}
            </span>{" "}
            (logged income − logged spend so far).
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
