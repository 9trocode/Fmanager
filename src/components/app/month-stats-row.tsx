import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Equal } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { MonthActuals, BudgetSummary } from "@/lib/aggregation";

export function MonthStatsRow({
  month,
  budgets,
}: {
  month: MonthActuals;
  budgets: BudgetSummary;
}) {
  const baseCurrency = month.baseCurrency;
  const overallBudgetPct =
    budgets.totalLimit > 0 ? (budgets.totalSpent / budgets.totalLimit) * 100 : 0;
  const netPositive = month.net >= 0;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <ArrowDownRight className="size-3.5 text-destructive" />
            Spent this month
          </CardDescription>
          <CardTitle className="text-3xl font-semibold tabular-nums mt-1 text-destructive">
            {formatMoney(month.expenses, baseCurrency)}
          </CardTitle>
          {budgets.rows.length > 0 ? (
            <CardDescription className="font-mono text-[11px]">
              {formatMoney(budgets.totalSpent, baseCurrency, { compact: true })} of{" "}
              {formatMoney(budgets.totalLimit, baseCurrency, { compact: true })}{" "}
              budgeted ({overallBudgetPct.toFixed(0)}%)
            </CardDescription>
          ) : (
            <CardDescription className="text-[11px]">
              No budgets set yet.
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
          <CardTitle className="text-3xl font-semibold tabular-nums mt-1 text-emerald-300">
            {formatMoney(month.income, baseCurrency)}
          </CardTitle>
          <CardDescription className="text-[11px]">
            From transactions tagged as income.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription className="flex items-center gap-2">
            <Equal className="size-3.5 text-muted-foreground" />
            Net this month
          </CardDescription>
          <CardTitle
            className={
              "text-3xl font-semibold tabular-nums mt-1 " +
              (netPositive ? "text-emerald-300" : "text-destructive")
            }
          >
            {formatMoney(month.net, baseCurrency, { signed: true })}
          </CardTitle>
          <CardDescription className="text-[11px]">
            {netPositive
              ? "Saving more than spending."
              : "Spending more than coming in."}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
