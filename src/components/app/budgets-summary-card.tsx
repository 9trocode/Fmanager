import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { BudgetSummary } from "@/lib/aggregation";

function barClass(p: number): string {
  if (p > 100) return "bg-destructive";
  if (p >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

function pctClass(p: number): string {
  if (p > 100) return "text-destructive";
  if (p >= 80) return "text-amber-400";
  return "text-muted-foreground";
}

export function BudgetsSummaryCard({ summary }: { summary: BudgetSummary }) {
  const overall =
    summary.totalLimit > 0 ? (summary.totalSpent / summary.totalLimit) * 100 : 0;
  const sorted = [...summary.rows].sort((a, b) => b.percentUsed - a.percentUsed);

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="size-4 text-muted-foreground" />
              Budgets this month
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/budgets">
                Set budgets <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
          <CardDescription>
            No budgets configured. Set monthly category limits to see them here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="size-4 text-muted-foreground" />
              Budgets this month
            </CardTitle>
            <CardDescription>
              <span className="font-mono tabular-nums">
                {formatMoney(summary.totalSpent, summary.baseCurrency, {
                  compact: true,
                })}
              </span>{" "}
              of{" "}
              <span className="font-mono tabular-nums">
                {formatMoney(summary.totalLimit, summary.baseCurrency, {
                  compact: true,
                })}
              </span>{" "}
              <span className={pctClass(overall)}>({overall.toFixed(0)}%)</span>
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs shrink-0">
            <Link href="/budgets">
              Manage <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {sorted.slice(0, 6).map((row) => {
          const w = Math.min(100, Math.max(0, row.percentUsed));
          return (
            <Link
              key={row.id}
              href={`/budgets/${row.id}`}
              className="block group"
            >
              <div className="space-y-1 px-1 py-1.5 rounded-md hover:bg-secondary/50 transition-colors">
                <div className="flex items-center justify-between text-sm gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{row.category}</span>
                    <span
                      className={
                        "text-[10px] font-mono " + pctClass(row.percentUsed)
                      }
                    >
                      {row.percentUsed.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums text-xs">
                      {formatMoney(row.spentThisMonth, row.baseCurrency, {
                        compact: true,
                      })}{" "}
                      <span className="text-muted-foreground">/</span>{" "}
                      {formatMoney(row.monthlyLimit, row.baseCurrency, {
                        compact: true,
                      })}
                    </div>
                    <div
                      className={
                        "text-[10px] font-mono " +
                        (row.remaining < 0
                          ? "text-destructive"
                          : "text-muted-foreground")
                      }
                    >
                      {row.remaining < 0
                        ? `${formatMoney(Math.abs(row.remaining), row.baseCurrency, { compact: true })} over`
                        : `${formatMoney(row.remaining, row.baseCurrency, { compact: true })} left`}
                    </div>
                  </div>
                </div>
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={"h-full " + barClass(row.percentUsed)}
                    style={{ width: `${w}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
        {sorted.length > 6 ? (
          <Link
            href="/budgets"
            className="block text-[11px] text-muted-foreground hover:text-foreground text-center pt-1"
          >
            +{sorted.length - 6} more · view all
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
