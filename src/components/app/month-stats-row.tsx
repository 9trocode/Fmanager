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
 * All three big numbers describe the SAME time period: this month so far,
 * from your logged transactions. They reconcile arithmetically:
 *   income (logged) − expenses (logged) = net.
 *
 * Recurring monthly income (from your flows) and the projected end-of-month
 * net are shown as smaller supplementary lines so users who don't log salary
 * still see what they typically earn.
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

  // Same source, same period, all three big numbers.
  const spent = month.expenses;
  const income = month.income;
  const net = income - spent; // === month.net

  // Supplementary: what you typically earn per month (recurring flows).
  const recurringIncome = flows.income;
  const showRecurring = recurringIncome > 0;
  // Forecast end-of-month assuming you receive full recurring income.
  const projectedEom = recurringIncome - spent;

  const netPositive = net >= 0;

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
            Income this month
          </CardDescription>
          <CardTitle className="text-3xl font-mono tracking-tight mt-1 text-emerald-300">
            {formatMoney(income, baseCurrency)}
          </CardTitle>
          <CardDescription className="text-[11px]">
            {income > 0
              ? "From transactions you've logged this month."
              : "Log income transactions to see your month-to-date inflow."}
          </CardDescription>
        </CardHeader>
        {showRecurring ? (
          <CardContent className="border-t border-border pt-3 text-[11px] font-mono text-muted-foreground">
            ~{formatMoney(recurringIncome, baseCurrency)} expected from
            recurring flows / month.
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
            {formatMoney(net, baseCurrency, { signed: true })}
          </CardTitle>
          <CardDescription className="text-[11px]">
            Income minus spending, this month so far.
          </CardDescription>
        </CardHeader>
        {showRecurring ? (
          <CardContent className="border-t border-border pt-3 text-[11px] font-mono text-muted-foreground">
            Forecast end-of-month:{" "}
            <span className={projectedEom >= 0 ? "text-emerald-300" : "text-destructive"}>
              {formatMoney(projectedEom, baseCurrency, { signed: true, compact: true })}
            </span>{" "}
            with full recurring income.
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
