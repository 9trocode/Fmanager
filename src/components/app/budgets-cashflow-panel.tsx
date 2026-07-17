"use client";

import Link from "next/link";
import { AlertTriangle, Info, Wallet } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatMoney } from "@/lib/format";

export type BudgetsCashFlowProps = {
  baseCurrency: string;
  monthlyIncome: number;
  /** Sum of all budget monthly limits (in base currency). */
  totalBudgeted: number;
  /** Recurring expenses from flows, by category, in base currency. */
  recurringByCategory: Record<string, number>;
  /** Categories that already have a budget. We use this to flag overlap. */
  budgetedCategories: string[];
  /**
   * MTD posted expenses with no matching budget category (i.e. truly
   * one-off this month). Lives as its own slice so the user sees actual
   * unbudgeted spend chip away at "free" cash, not just planned
   * commitments.
   */
  oneTimeExpenses?: number;
  liquidCash: number;
  monthsRunway: number | null;
};

function pct(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/**
 * "Budgets vs cash flow" — answers: where is my monthly income going,
 * and how much is actually free after budgets + recurring outflows + the
 * one-time expenses already logged this month?
 *
 * Four buckets:
 *   1. Budgeted    — sum of budget caps (intended discretionary spend)
 *   2. Recurring   — recurring flow expenses NOT covered by a budget category
 *   3. One-time    — MTD posted expenses with no matching budget category
 *   4. Free        — income − budgeted − recurring − one-time
 *
 * If a budget category overlaps a recurring flow category, we flag it so
 * the user knows they may be double-counting that category.
 */
export function BudgetsCashFlowPanel({
  baseCurrency,
  monthlyIncome,
  totalBudgeted,
  recurringByCategory,
  budgetedCategories,
  oneTimeExpenses = 0,
  liquidCash,
  monthsRunway,
}: BudgetsCashFlowProps) {
  const budgetedSet = new Set(
    budgetedCategories.map((c) => c.trim().toLowerCase()),
  );

  // Split recurring expenses into "covered by a budget" vs "not."
  let recurringNotBudgeted = 0;
  let recurringOverlap = 0;
  const overlappingCategories: Array<{ name: string; amount: number }> = [];
  for (const [cat, amt] of Object.entries(recurringByCategory)) {
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (budgetedSet.has(cat.trim().toLowerCase())) {
      recurringOverlap += amt;
      overlappingCategories.push({ name: cat, amount: amt });
    } else {
      recurringNotBudgeted += amt;
    }
  }

  const safeOneTime = Number.isFinite(oneTimeExpenses)
    ? Math.max(0, oneTimeExpenses)
    : 0;

  const allocated = totalBudgeted + recurringNotBudgeted + safeOneTime;
  const unallocated = Math.max(0, monthlyIncome - allocated);
  const overAllocated = Math.max(0, allocated - monthlyIncome);

  // Bar widths: scale to monthlyIncome; if over, scale to allocated so the
  // over-portion has visible space on the bar.
  const denom = Math.max(monthlyIncome, allocated, 1);
  const wBudget = pct(totalBudgeted, denom);
  const wRecurring = pct(recurringNotBudgeted, denom);
  const wOneTime = pct(safeOneTime, denom);
  const wFree = monthlyIncome > allocated ? pct(unallocated, denom) : 0;
  const wOver = overAllocated > 0 ? pct(overAllocated, denom) : 0;

  const noIncome = monthlyIncome <= 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
              Budgets vs cash flow
            </CardTitle>
            <CardDescription>
              {noIncome ? (
                <>
                  No recurring income tracked yet. Add a recurring inflow on{" "}
                  <Link
                    href="/cash-flow"
                    className="underline underline-offset-3 hover:text-foreground"
                  >
                    cash flow
                  </Link>{" "}
                  to see how budgets compare against income.
                </>
              ) : (
                <>
                  Where your monthly income is going, before the month is over.
                </>
              )}
            </CardDescription>
          </div>
          {!noIncome ? (
            <div className="text-left sm:text-right">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Monthly income
              </div>
              <div className="font-mono tabular-nums text-xl text-emerald-300">
                {formatMoney(monthlyIncome, baseCurrency)}
              </div>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stacked allocation bar */}
        <div className="space-y-2">
          <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
            {wBudget > 0 ? (
              <div
                className="h-full bg-blue-500/80"
                style={{ width: `${wBudget}%` }}
                title={`Budgeted: ${formatMoney(totalBudgeted, baseCurrency)}`}
              />
            ) : null}
            {wRecurring > 0 ? (
              <div
                className="h-full bg-amber-500/80"
                style={{ width: `${wRecurring}%` }}
                title={`Recurring (un-budgeted): ${formatMoney(recurringNotBudgeted, baseCurrency)}`}
              />
            ) : null}
            {wOneTime > 0 ? (
              <div
                className="h-full bg-orange-500/80"
                style={{ width: `${wOneTime}%` }}
                title={`One-time spend this month: ${formatMoney(safeOneTime, baseCurrency)}`}
              />
            ) : null}
            {wFree > 0 ? (
              <div
                className="h-full bg-emerald-500/70"
                style={{ width: `${wFree}%` }}
                title={`Free: ${formatMoney(unallocated, baseCurrency)}`}
              />
            ) : null}
            {wOver > 0 ? (
              <div
                className="h-full bg-destructive"
                style={{ width: `${wOver}%` }}
                title={`Over income: ${formatMoney(overAllocated, baseCurrency)}`}
              />
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm sm:grid-cols-5 sm:gap-3 sm:text-xs">
            <LegendItem
              swatch="bg-blue-500/80"
              label="Budgeted"
              amount={totalBudgeted}
              currency={baseCurrency}
              share={
                monthlyIncome > 0 ? (totalBudgeted / monthlyIncome) * 100 : null
              }
            />
            <LegendItem
              swatch="bg-amber-500/80"
              label="Recurring"
              amount={recurringNotBudgeted}
              currency={baseCurrency}
              share={
                monthlyIncome > 0
                  ? (recurringNotBudgeted / monthlyIncome) * 100
                  : null
              }
              hint="Fixed monthly flows not in a budget"
            />
            <LegendItem
              swatch="bg-orange-500/80"
              label="One-time"
              amount={safeOneTime}
              currency={baseCurrency}
              share={
                monthlyIncome > 0 ? (safeOneTime / monthlyIncome) * 100 : null
              }
              hint="MTD posted spend with no matching budget"
            />
            {overAllocated > 0 ? (
              <LegendItem
                swatch="bg-destructive"
                label="Over income"
                amount={overAllocated}
                currency={baseCurrency}
                share={null}
                hint="Allocations exceed income"
                emphasize
              />
            ) : (
              <LegendItem
                swatch="bg-emerald-500/70"
                label="Free"
                amount={unallocated}
                currency={baseCurrency}
                share={
                  monthlyIncome > 0 ? (unallocated / monthlyIncome) * 100 : null
                }
                hint="Unallocated — could go to savings"
              />
            )}
            <div className="min-w-0 space-y-1 sm:space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-sm bg-secondary" />
                <span className="font-medium text-muted-foreground">
                  Liquid cash
                </span>
              </div>
              <div className="font-mono tabular-nums">
                {formatMoney(liquidCash, baseCurrency)}
              </div>
              <div className="text-xs leading-relaxed text-muted-foreground sm:text-[10px]">
                {monthsRunway != null
                  ? `${monthsRunway.toFixed(1)} mo of runway`
                  : "Income covers expenses"}
              </div>
            </div>
          </div>
        </div>

        {/* Health line */}
        {!noIncome ? (
          overAllocated > 0 ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs">
              <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-medium text-destructive">
                  Allocations exceed monthly income by{" "}
                  {formatMoney(overAllocated, baseCurrency)}.
                </div>
                <div className="text-muted-foreground leading-relaxed">
                  You&apos;ve committed {formatMoney(allocated, baseCurrency)}{" "}
                  to budgets + recurring outflows but only bring in{" "}
                  {formatMoney(monthlyIncome, baseCurrency)} per month. Either
                  trim a budget, drop a recurring outflow, or treat the gap as a
                  planned drawdown from liquid cash.
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground leading-relaxed">
              You&apos;ve committed{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatMoney(allocated, baseCurrency)}
              </span>{" "}
              of{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatMoney(monthlyIncome, baseCurrency)}
              </span>{" "}
              (
              {monthlyIncome > 0
                ? ((allocated / monthlyIncome) * 100).toFixed(0)
                : 0}
              %).{" "}
              {unallocated > 0 ? (
                <>
                  <span className="font-mono tabular-nums text-emerald-300">
                    {formatMoney(unallocated, baseCurrency)}
                  </span>{" "}
                  is unallocated each month — point a savings goal at it on{" "}
                  <Link
                    href="/savings"
                    className="underline underline-offset-3 hover:text-foreground"
                  >
                    savings
                  </Link>
                  .
                </>
              ) : (
                <>Income exactly matches allocations — no slack for savings.</>
              )}
            </div>
          )
        ) : null}

        {/*
          Linked-flow info. When a recurring flow shares a budget category,
          its auto-accrued transactions land in that budget — no
          double-count. Used to be a warning ("budget is on top of, not
          instead of") which was wrong post auto-accrual; now it's just a
          neutral confirmation so the user understands the linkage.
        */}
        {overlappingCategories.length > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-blue-500/25 bg-blue-500/5 p-3 text-xs">
            <Info className="size-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-medium text-blue-200">
                {overlappingCategories.length === 1
                  ? "1 recurring flow auto-fills a budget"
                  : `${overlappingCategories.length} recurring flows auto-fill budgets`}
                .
              </div>
              <div className="break-words text-muted-foreground leading-relaxed [overflow-wrap:anywhere]">
                Recurring{" "}
                {overlappingCategories.map((c, i) => (
                  <span key={c.name}>
                    <span className="font-mono text-foreground">{c.name}</span>
                    {i < overlappingCategories.length - 1 ? ", " : ""}
                  </span>
                ))}{" "}
                ({formatMoney(recurringOverlap, baseCurrency)} / mo) accrues
                straight into the matching budget — no double-count, the budget
                cap is the source of truth.
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LegendItem({
  swatch,
  label,
  amount,
  currency,
  share,
  hint,
  emphasize,
}: {
  swatch: string;
  label: string;
  amount: number;
  currency: string;
  share: number | null;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1 sm:space-y-0.5">
      <div className="flex items-center gap-2">
        <span className={"size-2 rounded-sm " + swatch} />
        <span
          className={
            "font-medium " +
            (emphasize ? "text-destructive" : "text-muted-foreground")
          }
        >
          {label}
        </span>
      </div>
      <div className="font-mono tabular-nums">
        {formatMoney(amount, currency)}
        {share != null ? (
          <span className="ml-1 text-xs text-muted-foreground sm:text-[10px]">
            ({share.toFixed(0)}%)
          </span>
        ) : null}
      </div>
      {hint ? (
        <div className="text-xs leading-relaxed text-muted-foreground sm:text-[10px]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
