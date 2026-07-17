"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Target,
  Trash2,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/app/empty-state";
import { AddBudgetDialog } from "@/components/app/add-budget-dialog";
import {
  EditBudgetDialog,
  type BudgetEditRow,
} from "@/components/app/edit-budget-dialog";
import { BudgetsCashFlowPanel } from "@/components/app/budgets-cashflow-panel";
import { deleteBudget } from "@/lib/actions/budgets";
import { formatMoney } from "@/lib/format";
import { useRole } from "@/components/app/role-context";
import type { BudgetStatus } from "@/lib/aggregation";

export type BudgetsManagerProps = {
  baseCurrency: string;
  rows: BudgetStatus[];
  totalLimit: number;
  totalSpent: number;
  monthlyIncome: number;
  recurringByCategory: Record<string, number>;
  /**
   * MTD posted expense transactions whose category is NOT in any budget.
   * Surfaced as a separate "one-time" slice on the Budgets vs cash flow
   * panel so the user sees how much income is actually free after every
   * commitment AND every actual unbudgeted spend so far this month.
   */
  oneTimeExpensesThisMonth: number;
  liquidCash: number;
  monthsRunway: number | null;
  /**
   * Accounts available for the per-budget "scope to account" picker.
   * Forwarded into AddBudgetDialog and EditBudgetDialog and used by
   * each BudgetRow to render the linked account name (when set).
   */
  accountOptions?: Array<{ id: number; name: string; currency: string }>;
  /** Active global month filter (YYYY-MM). When in the future, edits
   *  are scoped to that month via the budget_overrides table. */
  activeMonthKey?: string | null;
  isFutureMonth?: boolean;
  monthLabel?: string | null;
};

function barClass(percentUsed: number): string {
  if (percentUsed > 100) return "bg-destructive";
  if (percentUsed >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

function pctLabelClass(percentUsed: number): string {
  if (percentUsed > 100) return "text-destructive";
  if (percentUsed >= 80) return "text-amber-400";
  return "text-muted-foreground";
}

function BudgetRow({
  row,
  accountOptions = [],
  activeMonthKey = null,
  isFutureMonth = false,
  monthLabel = null,
}: {
  row: BudgetStatus;
  accountOptions?: Array<{ id: number; name: string; currency: string }>;
  activeMonthKey?: string | null;
  isFutureMonth?: boolean;
  monthLabel?: string | null;
}) {
  const role = useRole();
  const [editOpen, setEditOpen] = useState(false);
  const [, startTransition] = useTransition();
  const readOnly = role === "viewer";
  const linkedAccount = accountOptions.find((a) => a.id === row.accountId);

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", String(row.id));
    startTransition(async () => {
      await deleteBudget(fd);
    });
  }

  const editable: BudgetEditRow = {
    id: row.id,
    category: row.category,
    monthlyLimit: row.monthlyLimit,
    currency: row.baseCurrency,
    accountId: row.accountId,
    notes: row.notes,
  };

  const widthPct = Math.min(100, Math.max(0, row.percentUsed));

  return (
    <div className="group flex items-start justify-between gap-2 rounded-md border border-border px-3 py-3 transition-colors hover:bg-secondary/40 md:gap-4 md:px-4">
      <Link
        href={`/budgets/${row.id}`}
        className="min-w-0 flex-1 space-y-2 block"
      >
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-3">
          <div className="flex min-w-0 flex-wrap items-start gap-2">
            <span className="min-w-0 break-words font-medium leading-snug md:truncate">
              {row.category}
            </span>
            <span
              className={
                "shrink-0 font-mono text-xs md:text-[10px] " +
                pctLabelClass(row.percentUsed)
              }
            >
              {row.percentUsed.toFixed(0)}%
            </span>
            {linkedAccount ? (
              <span
                className="text-[10px] font-mono text-muted-foreground"
                title="This budget only counts spending on this account"
              >
                · {linkedAccount.name}
              </span>
            ) : null}
            <ChevronRight className="hidden size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 md:block" />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-1.5 text-left md:block md:shrink-0 md:text-right">
            <div className="font-mono text-sm tabular-nums">
              {formatMoney(row.spentThisMonth, row.baseCurrency)}{" "}
              <span className="text-muted-foreground">of</span>{" "}
              {formatMoney(row.monthlyLimit, row.baseCurrency)}
            </div>
            <div
              className={
                "font-mono text-xs md:text-[10px] " +
                (row.remaining < 0
                  ? "text-destructive"
                  : "text-muted-foreground")
              }
            >
              {row.remaining < 0
                ? `${formatMoney(Math.abs(row.remaining), row.baseCurrency)} over`
                : `${formatMoney(row.remaining, row.baseCurrency)} left`}
            </div>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
          <div
            className={"h-full " + barClass(row.percentUsed)}
            style={{ width: `${widthPct}%` }}
          />
        </div>
        {row.notes ? (
          <div className="line-clamp-2 break-words text-xs leading-relaxed text-muted-foreground md:truncate">
            {row.notes}
          </div>
        ) : null}
      </Link>
      {readOnly ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 size-10 shrink-0 md:mr-0 md:size-8"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this budget?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanent. Transactions are not affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <EditBudgetDialog
        budget={editable}
        open={editOpen}
        onOpenChange={setEditOpen}
        accountOptions={accountOptions}
        activeMonthKey={activeMonthKey}
        isFutureMonth={isFutureMonth}
        monthLabel={monthLabel}
      />
    </div>
  );
}

export function BudgetsManager({
  baseCurrency,
  rows,
  totalLimit,
  totalSpent,
  monthlyIncome,
  recurringByCategory,
  oneTimeExpensesThisMonth,
  liquidCash,
  monthsRunway,
  accountOptions = [],
  activeMonthKey = null,
  isFutureMonth = false,
  monthLabel = null,
}: BudgetsManagerProps) {
  const overallPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

  const budgetedCategories = rows.map((r) => r.category);

  return (
    <div className="space-y-6">
      <BudgetsCashFlowPanel
        baseCurrency={baseCurrency}
        monthlyIncome={monthlyIncome}
        totalBudgeted={totalLimit}
        recurringByCategory={recurringByCategory}
        budgetedCategories={budgetedCategories}
        oneTimeExpenses={oneTimeExpensesThisMonth}
        liquidCash={liquidCash}
        monthsRunway={monthsRunway}
      />

      {rows.length > 0 ? (
        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total monthly limit</CardDescription>
              <CardTitle className="text-2xl font-mono tabular-nums">
                {formatMoney(totalLimit, baseCurrency)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Spent this month</CardDescription>
              <CardTitle
                className={
                  "text-2xl font-mono tabular-nums " +
                  (overallPct > 100 ? "text-destructive" : "")
                }
              >
                {formatMoney(totalSpent, baseCurrency)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>% of total used</CardDescription>
              <CardTitle
                className={
                  "text-2xl font-mono tabular-nums " +
                  (overallPct > 100
                    ? "text-destructive"
                    : overallPct >= 80
                      ? "text-amber-400"
                      : "")
                }
              >
                {overallPct.toFixed(0)}%
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={"h-full " + barClass(overallPct)}
                  style={{ width: `${Math.min(100, overallPct)}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          By category
        </h2>
        <AddBudgetDialog
          baseCurrency={baseCurrency}
          accountOptions={accountOptions}
          activeMonthKey={activeMonthKey}
          isFutureMonth={isFutureMonth}
          monthLabel={monthLabel}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="Set monthly spending limits per category. Spend is calculated from this month's transactions."
          action={
            <AddBudgetDialog
              baseCurrency={baseCurrency}
              activeMonthKey={activeMonthKey}
              isFutureMonth={isFutureMonth}
              monthLabel={monthLabel}
            />
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <BudgetRow
              key={r.id}
              row={r}
              accountOptions={accountOptions}
              activeMonthKey={activeMonthKey}
              isFutureMonth={isFutureMonth}
              monthLabel={monthLabel}
            />
          ))}
        </div>
      )}
    </div>
  );
}
