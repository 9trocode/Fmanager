"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowDownRight,
  ArrowUpRight,
  Archive,
  ArchiveRestore,
  Target,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/app/money-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";
import { AddTransactionDialog } from "@/components/app/add-transaction-dialog";
import { TransactionItem } from "@/components/app/transactions-list";
import type { TransactionAccountOption } from "@/components/app/transaction-form-fields";
import {
  applyFlowNow,
  createFlow,
  deleteFlow,
  toggleFlowArchived,
  updateFlow,
} from "@/lib/actions/flows";
import { toast } from "sonner";
import {
  FLOW_CADENCE_LABEL,
  SUGGESTED_EXPENSE_CATEGORIES,
  SUGGESTED_INCOME_CATEGORIES,
  monthlyEquivalent,
} from "@/lib/flows";
import { SUPPORTED_CURRENCIES, formatMoney } from "@/lib/format";
import type { FlowCadence, FlowKind } from "@/lib/db/schema";
import { useRole } from "@/components/app/role-context";

export type FlowRow = {
  id: number;
  name: string;
  kind: FlowKind;
  category: string | null;
  amount: number;
  currency: string;
  cadence: FlowCadence;
  accountId: number | null;
  /** Optional destination account — when set on an expense flow, the
   *  flow is an internal transfer (debit source, credit dest). */
  destAccountId?: number | null;
  /** Optional explicit next-due date (YYYY-MM-DD). */
  nextDueAt?: string | null;
  archived: boolean;
  notes: string | null;
};

function FlowFields({
  defaults,
  defaultKind,
  accountOptions,
  budgets = [],
}: {
  defaults?: FlowRow;
  defaultKind?: FlowKind;
  accountOptions: Array<{ id: number; name: string; currency: string; type?: string }>;
  /**
   * All active budgets. When the user is creating an EXPENSE flow, we
   * surface a "Budget" select so they can attach the flow to a budget
   * directly — selecting one auto-fills `category` with the budget's
   * category, which is how the auto-accruer + budget aggregation
   * connect them. Picking "none" leaves category as plain free-text.
   */
  budgets?: Array<{ id: number; category: string; currency: string }>;
}) {
  const kind = defaults?.kind ?? defaultKind ?? "expense";
  const categories =
    kind === "income"
      ? SUGGESTED_INCOME_CATEGORIES
      : SUGGESTED_EXPENSE_CATEGORIES;
  const initialAccountId =
    defaults?.accountId != null
      ? String(defaults.accountId)
      : accountOptions[0]
        ? String(accountOptions[0].id)
        : "none";
  const [accountId, setAccountId] = useState(initialAccountId);
  const linkedAccount = accountOptions.find((a) => String(a.id) === accountId);
  const isLoanAccount = linkedAccount?.type === "loan";

  // Optional destination — only valid for expense flows. When set,
  // this flow is an INTERNAL TRANSFER: money leaves `accountId` and
  // lands in `destAccountId`. Use case: monthly savings contribution
  // to a goal-linked account, paying down a loan account, etc.
  const initialDestAccountId =
    defaults?.destAccountId != null ? String(defaults.destAccountId) : "none";
  const [destAccountId, setDestAccountId] = useState(initialDestAccountId);

  // Controlled currency so we can warn the user when it mismatches
  // the linked account's currency. Without this, a flow's
  // transactions would post in the flow's currency on an account
  // that's denominated in another — and the balance math has to
  // FX-convert every time, with stale rates skewing net worth.
  // Default-fill from the account once one's picked so the common
  // case (matched currencies) just works without intervention.
  const [currency, setCurrency] = useState(
    defaults?.currency ?? accountOptions[0]?.currency ?? "USD",
  );
  const currencyMismatch =
    linkedAccount != null && linkedAccount.currency !== currency;

  // Controlled category — driven by either the user typing or by the
  // Budget select (which sets category to the budget's category text).
  const [category, setCategory] = useState<string>(defaults?.category ?? "");

  // Derive the initial budget selection from the existing category
  // (case-insensitive match). This way reopening the edit dialog for a
  // flow already tied to a budget keeps the dropdown in sync.
  const initialBudgetId = (() => {
    if (!defaults?.category) return "none";
    const match = budgets.find(
      (b) =>
        b.category.trim().toLowerCase() ===
        defaults.category!.trim().toLowerCase(),
    );
    return match ? String(match.id) : "none";
  })();
  const [budgetId, setBudgetId] = useState(initialBudgetId);
  const showBudgetPicker = kind === "expense" && budgets.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaults?.name ?? ""}
            placeholder={kind === "income" ? "Monthly salary" : "Monthly rent"}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            name="category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              // If user types a value that doesn't match the picked
              // budget anymore, clear the picker so it doesn't lie.
              if (
                budgetId !== "none" &&
                e.target.value.trim().toLowerCase() !==
                  budgets
                    .find((b) => String(b.id) === budgetId)
                    ?.category.trim()
                    .toLowerCase()
              ) {
                setBudgetId("none");
              }
            }}
            placeholder={categories[0]}
            list={`${kind}-categories`}
          />
          <datalist id={`${kind}-categories`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      {showBudgetPicker ? (
        <div className="space-y-1.5">
          <Label htmlFor="budget_id">Tie to a budget (optional)</Label>
          <Select
            value={budgetId}
            onValueChange={(v) => {
              setBudgetId(v);
              if (v === "none") return;
              const b = budgets.find((x) => String(x.id) === v);
              if (b) setCategory(b.category);
            }}
          >
            <SelectTrigger id="budget_id">
              <SelectValue placeholder="No budget" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">— no budget —</span>
              </SelectItem>
              {budgets.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.category} ({b.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Picking a budget sets this flow&apos;s category to match.
            Auto-accrued transactions then count toward that budget
            automatically — every paycheck-day rent post chips at the
            limit instead of you logging each one by hand.
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <MoneyInput
            id="amount"
            name="amount"
            defaultValue={defaults?.amount ?? null}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <input type="hidden" name="currency" value={currency} />
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cadence">Cadence</Label>
          <Select name="cadence" defaultValue={defaults?.cadence ?? "monthly"}>
            <SelectTrigger id="cadence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["weekly", "monthly", "yearly"] as const).map((c) => (
                <SelectItem key={c} value={c}>
                  {FLOW_CADENCE_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <input type="hidden" name="kind" value={kind} />

      {/*
        Optional anchor date — when set, the accruer posts ON THIS DATE
        (then advances by one cadence). Lets the user say "salary
        lands on the 25th" or "rent's due on the 1st" rather than
        having posts drift relative to creation date.
      */}
      <div className="space-y-1.5">
        <Label htmlFor="next_due_at">
          {kind === "income" ? "Next paid on" : "Next due on"}{" "}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Input
          id="next_due_at"
          name="next_due_at"
          type="date"
          defaultValue={defaults?.nextDueAt ?? ""}
          className="dark:[color-scheme:dark]"
        />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Pin the day this {kind === "income" ? "income" : "expense"} should
          land. Future date defers the first post until then; past or empty
          posts immediately and uses cadence from there.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="account_id">
          {kind === "income" ? "Lands in account" : "Comes out of account"}
        </Label>
        <input type="hidden" name="account_id" value={accountId} />
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="account_id">
            <SelectValue
              placeholder={
                accountOptions.length === 0
                  ? "Add an account first"
                  : "Pick an account"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">
              <span className="text-muted-foreground">— none —</span>
            </SelectItem>
            {accountOptions.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name} ({a.currency})
                {a.type === "loan" ? " · loan" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isLoanAccount ? (
          <p className="text-[10px] text-amber-300/90 leading-relaxed">
            Heads up: paying a loan account isn&apos;t really an expense — it&apos;s
            a transfer. To reduce the loan&apos;s balance each month, also log a
            transaction (kind = transfer) from your cash account to this loan
            account. The recurring flow tracks the planned amount; the
            transaction applies it.
          </p>
        ) : null}
        {currencyMismatch && linkedAccount ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 space-y-1.5">
            <p className="text-[11px] text-amber-300 leading-snug">
              <span className="font-medium">Currency mismatch.</span> This
              flow is in <span className="font-mono">{currency}</span> but{" "}
              <span className="font-mono">{linkedAccount.name}</span> is
              denominated in{" "}
              <span className="font-mono">{linkedAccount.currency}</span>.
              Posted transactions will be FX-converted into{" "}
              <span className="font-mono">{linkedAccount.currency}</span>{" "}
              when summed into the account balance — that works, but uses
              the latest cached rate each time and can drift.
            </p>
            <button
              type="button"
              onClick={() => setCurrency(linkedAccount.currency)}
              className="text-[11px] text-amber-200 hover:text-amber-100 underline underline-offset-2"
            >
              Match account → use {linkedAccount.currency}
            </button>
          </div>
        ) : null}
      </div>

      {/*
        Destination account — turns an expense flow into an internal
        transfer. Only shown for expense flows (income lands in
        accountId, full stop). Hidden input still posts the value so
        the action can clear it on kind=income flows.
      */}
      {kind === "expense" ? (
        <div className="space-y-1.5">
          <Label htmlFor="dest_account_id">
            Goes into account (optional)
          </Label>
          <input
            type="hidden"
            name="dest_account_id"
            value={destAccountId}
          />
          <Select value={destAccountId} onValueChange={setDestAccountId}>
            <SelectTrigger id="dest_account_id">
              <SelectValue placeholder="— none —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">
                  — none (money leaves your wealth) —
                </span>
              </SelectItem>
              {accountOptions
                .filter((a) => String(a.id) !== accountId)
                .map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} ({a.currency})
                    {a.type === "loan" ? " · loan" : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Pick this when the money moves between your own accounts
            (e.g. monthly savings contribution, paying a loan account).
            It posts as a <span className="font-mono">transfer</span> and
            is excluded from monthly burn — both balances move, your
            net wealth stays the same.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Vendor, contract end date, anything that matters."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>
    </div>
  );
}

function AddFlowDialog({
  defaultKind,
  accountOptions,
  budgets,
}: {
  defaultKind: FlowKind;
  accountOptions: Array<{ id: number; name: string; currency: string; type?: string }>;
  budgets: Array<{ id: number; category: string; currency: string }>;
}) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={defaultKind === "income" ? "outline" : "default"}>
          <Plus className="size-4" />
          New {defaultKind}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New recurring {defaultKind}</DialogTitle>
          <DialogDescription>
            Recurring {defaultKind === "income" ? "inflows feed" : "outflows reduce"} your
            monthly cash flow and the runway widget on the dashboard.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              try {
                await createFlow(fd);
                toast.success(`Added recurring ${defaultKind}.`);
                setOpen(false);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Couldn't save.",
                );
              }
            })
          }
          className="space-y-4"
        >
          <FlowFields
            defaultKind={defaultKind}
            accountOptions={accountOptions}
            budgets={budgets}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending} loading={pending}>
              {pending ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFlowDialog({
  flow,
  open,
  onOpenChange,
  accountOptions,
  budgets,
  activeMonthKey,
  isFutureMonth,
  monthLabel,
}: {
  flow: FlowRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountOptions: Array<{ id: number; name: string; currency: string; type?: string }>;
  budgets: Array<{ id: number; category: string; currency: string }>;
  /** Active global month filter (YYYY-MM). Passed via hidden input so
   *  the server action can scope edits to that month when it's a
   *  future month. */
  activeMonthKey?: string | null;
  isFutureMonth?: boolean;
  monthLabel?: string | null;
}) {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Edit {flow.kind}
            {isFutureMonth && monthLabel ? (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                — for {monthLabel} only
              </span>
            ) : null}
          </DialogTitle>
          {isFutureMonth && monthLabel ? (
            <DialogDescription className="text-xs">
              Changes here apply to <span className="font-medium">{monthLabel}</span>{" "}
              only — current and previous months stay as-is. To make a
              permanent change, switch to the current month from the
              sidebar and edit there.
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              try {
                await updateFlow(fd);
                toast.success(
                  isFutureMonth && monthLabel
                    ? `Updated ${flow.name} for ${monthLabel}.`
                    : `Updated ${flow.name}.`,
                );
                onOpenChange(false);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Couldn't save.",
                );
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={flow.id} />
          {isFutureMonth && activeMonthKey ? (
            <input type="hidden" name="month_key" value={activeMonthKey} />
          ) : null}
          <FlowFields
            defaults={flow}
            accountOptions={accountOptions}
            budgets={budgets}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending} loading={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FlowRow({
  flow,
  accountOptions,
  budget,
  allBudgets,
  activeMonthKey,
  isFutureMonth,
  monthLabel,
}: {
  flow: FlowRow;
  accountOptions: Array<{ id: number; name: string; currency: string; type?: string }>;
  /** Budget that this flow's category maps to, if any. */
  budget?: { id: number; category: string; currency: string };
  /** Full budget list, forwarded to EditFlowDialog → FlowFields. */
  allBudgets: Array<{ id: number; category: string; currency: string }>;
  activeMonthKey?: string | null;
  isFutureMonth?: boolean;
  monthLabel?: string | null;
}) {
  const role = useRole();
  const [editOpen, setEditOpen] = useState(false);
  const [, startTransition] = useTransition();
  const monthly = monthlyEquivalent(flow.amount, flow.cadence);
  const readOnly = role === "viewer";
  const linked = accountOptions.find((a) => a.id === flow.accountId);
  const destLinked = accountOptions.find(
    (a) => a.id === flow.destAccountId,
  );
  const isTransferFlow = flow.kind === "expense" && flow.destAccountId != null;

  function handleArchive() {
    const fd = new FormData();
    fd.set("id", String(flow.id));
    fd.set("archived", String(flow.archived));
    startTransition(async () => {
      await toggleFlowArchived(fd);
    });
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", String(flow.id));
    startTransition(async () => {
      await deleteFlow(fd);
    });
  }

  function handleApplyNow() {
    if (flow.accountId == null) {
      toast.error("Link this flow to an account before applying it.");
      return;
    }
    const fd = new FormData();
    fd.set("id", String(flow.id));
    startTransition(async () => {
      try {
        await applyFlowNow(fd);
        toast.success(
          `Posted ${flow.kind === "income" ? "income" : "expense"} for ${flow.name}`,
          { description: "Visible in Transactions and the runway widget." },
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't apply the flow.",
        );
      }
    });
  }

  const isIncome = flow.kind === "income";

  const clickable = !readOnly;

  return (
    <div
      className={
        "flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border " +
        (flow.archived ? "opacity-50 " : "") +
        (clickable ? "cursor-pointer hover:bg-secondary/40 " : "") +
        "transition-colors"
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={() => {
        if (clickable) setEditOpen(true);
      }}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setEditOpen(true);
        }
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={
            "size-8 rounded-md grid place-items-center shrink-0 " +
            (isIncome
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-destructive/15 text-destructive")
          }
        >
          {isIncome ? (
            <ArrowUpRight className="size-4" />
          ) : (
            <ArrowDownRight className="size-4" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{flow.name}</span>
            {flow.category ? (
              <Badge variant="secondary" className="text-[10px]">
                {flow.category}
              </Badge>
            ) : null}
            <span className="text-[10px] font-mono text-muted-foreground">
              {FLOW_CADENCE_LABEL[flow.cadence].toLowerCase()}
            </span>
            {flow.nextDueAt ? (
              <span
                className="text-[10px] font-mono text-muted-foreground"
                title={`Next ${isIncome ? "paid" : "due"} on ${flow.nextDueAt}`}
              >
                · next {flow.nextDueAt}
              </span>
            ) : null}
            {linked ? (
              <span className="text-[10px] font-mono text-muted-foreground">
                · {isIncome ? "→" : "←"} {linked.name}
                {linked.type === "loan" ? (
                  <span className="text-amber-300/80"> (loan)</span>
                ) : null}
              </span>
            ) : (
              <span className="text-[10px] font-mono text-amber-300/70">
                · no account linked
              </span>
            )}
            {isTransferFlow && destLinked ? (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 border-emerald-500/30 text-emerald-300"
                title={`Each cycle moves money from ${linked?.name ?? "source"} into ${destLinked.name}. Excluded from monthly burn.`}
              >
                → {destLinked.name}
              </Badge>
            ) : null}
            {budget && !isIncome ? (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 border-blue-500/30 text-blue-300"
                title={`Auto-accrued transactions tagged "${budget.category}" count toward this budget`}
              >
                <Target className="size-2.5" />
                {budget.category} budget
              </Badge>
            ) : null}
          </div>
          {flow.notes ? (
            <div className="text-xs text-muted-foreground truncate">{flow.notes}</div>
          ) : null}
        </div>
      </div>
      <div
        className="flex items-center gap-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-right">
          <div
            className={
              "font-mono tabular-nums text-sm " +
              (isIncome ? "text-emerald-300" : "")
            }
          >
            {isIncome ? "+" : "−"}
            {formatMoney(flow.amount, flow.currency)}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            ≈ {formatMoney(monthly, flow.currency)} / mo
          </div>
        </div>
        {readOnly ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              {!flow.archived ? (
                <DropdownMenuItem onSelect={handleApplyNow}>
                  <Zap className="size-4" />
                  Apply now
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={handleArchive}>
                {flow.archived ? (
                  <>
                    <ArchiveRestore className="size-4" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="size-4" />
                    Archive
                  </>
                )}
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
                    <AlertDialogTitle>Delete this flow?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Permanent — removes the flow AND every transaction
                      it auto-posted, so account balances reset to what
                      they would have been without it. Archive instead
                      if you want to stop future posts but keep history.
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
      </div>

      <EditFlowDialog
        flow={flow}
        open={editOpen}
        onOpenChange={setEditOpen}
        accountOptions={accountOptions}
        budgets={allBudgets}
        activeMonthKey={activeMonthKey}
        isFutureMonth={isFutureMonth}
        monthLabel={monthLabel}
      />
    </div>
  );
}

export function FlowsManager({
  flows,
  baseCurrency,
  monthlyIncomeInBase,
  monthlyExpensesInBase,
  accountOptions,
  recentTransactions = [],
  budgetByCategory = {},
  activeMonthKey = null,
  isFutureMonth = false,
  monthLabel = null,
}: {
  flows: FlowRow[];
  baseCurrency: string;
  monthlyIncomeInBase: number;
  monthlyExpensesInBase: number;
  accountOptions: TransactionAccountOption[];
  /**
   * Recent transactions used to render the "Recent one-time" list under
   * the recurring flows. Optional — page can omit and the list is hidden.
   */
  recentTransactions?: import("@/components/app/transactions-list").TransactionRow[];
  /**
   * Map of lowercased category → budget. When a flow's category matches
   * a budget, we surface a "Counts toward Groceries budget" hint so the
   * user understands recurring expenses naturally feed into budgets via
   * auto-accrual + category match.
   */
  budgetByCategory?: Record<
    string,
    { id: number; category: string; currency: string }
  >;
  /** Currently-active global month filter (YYYY-MM). */
  activeMonthKey?: string | null;
  /** True when the active month is in the future — drives the "edit
   *  only this month" UI on the flow dialog. */
  isFutureMonth?: boolean;
  /** Human label for the active month, used in the dialog hint. */
  monthLabel?: string | null;
}) {
  const [tab, setTab] = useState<"all" | "expense" | "income">("all");
  const filtered = useMemo(
    () => (tab === "all" ? flows : flows.filter((f) => f.kind === tab)),
    [flows, tab],
  );
  const expenses = filtered.filter((f) => f.kind === "expense");
  const incomes = filtered.filter((f) => f.kind === "income");

  // Stable array for the form's budget picker. Same data the per-row
  // hint uses, just shaped for a Select.
  const budgetsArray = useMemo(
    () => Object.values(budgetByCategory),
    [budgetByCategory],
  );

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly income</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums text-emerald-300">
              {formatMoney(monthlyIncomeInBase, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly expenses</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums text-destructive">
              {formatMoney(monthlyExpensesInBase, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net monthly</CardDescription>
            <CardTitle
              className={
                "text-2xl font-mono tabular-nums " +
                (monthlyIncomeInBase - monthlyExpensesInBase >= 0
                  ? "text-emerald-300"
                  : "text-destructive")
              }
            >
              {formatMoney(
                monthlyIncomeInBase - monthlyExpensesInBase,
                baseCurrency,
                { signed: true },
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="w-auto"
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="expense">Expenses</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          {accountOptions.length > 0 ? (
            <AddTransactionDialog
              accounts={accountOptions}
              defaultKind="expense"
              budgets={budgetsArray}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="size-4" />
                  One-time
                </Button>
              }
            />
          ) : null}
          <AddFlowDialog defaultKind="income" accountOptions={accountOptions} budgets={budgetsArray} />
          <AddFlowDialog defaultKind="expense" accountOptions={accountOptions} budgets={budgetsArray} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-2 leading-relaxed">
        <span className="text-foreground font-medium">Recurring</span>{" "}
        flows shape your monthly take.{" "}
        <span className="text-foreground font-medium">One-time</span>{" "}
        events (vacation, tax bill, lawyer fee) are logged as transactions —
        click <span className="font-mono">One-time</span> to add one without
        leaving this page.
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ArrowDownRight}
          title="No recurring flows yet"
          description="Add your fixed monthly outflows and inflows. The dashboard runway widget and projections will use these immediately."
          action={
            <div className="flex gap-2">
              <AddFlowDialog defaultKind="expense" accountOptions={accountOptions} budgets={budgetsArray} />
              <AddFlowDialog defaultKind="income" accountOptions={accountOptions} budgets={budgetsArray} />
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {tab !== "income" && expenses.length > 0 ? (
            <div className="space-y-2">
              {tab === "all" ? (
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Expenses
                </h3>
              ) : null}
              <div className="space-y-2">
                {expenses.map((f) => (
                  <FlowRow
                    key={f.id}
                    flow={f}
                    accountOptions={accountOptions}
                    allBudgets={budgetsArray}
                    budget={
                      f.category
                        ? budgetByCategory[f.category.trim().toLowerCase()]
                        : undefined
                    }
                    activeMonthKey={activeMonthKey}
                    isFutureMonth={isFutureMonth}
                    monthLabel={monthLabel}
                  />
                ))}
              </div>
            </div>
          ) : null}
          {tab !== "expense" && incomes.length > 0 ? (
            <div className="space-y-2">
              {tab === "all" ? (
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Income
                </h3>
              ) : null}
              <div className="space-y-2">
                {incomes.map((f) => (
                  <FlowRow
                    key={f.id}
                    flow={f}
                    accountOptions={accountOptions}
                    allBudgets={budgetsArray}
                    budget={
                      f.category
                        ? budgetByCategory[f.category.trim().toLowerCase()]
                        : undefined
                    }
                    activeMonthKey={activeMonthKey}
                    isFutureMonth={isFutureMonth}
                    monthLabel={monthLabel}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/*
        Recent one-time transactions. Closes the loop on "I clicked
        One-time and the dialog vanished — did anything happen?". We
        show up to 8 of the most recent and link out to the full
        transactions page for everything else. The same `tab` filter
        applies (Expenses / Income) so the section follows what the user
        is currently looking at.
      */}
      {recentTransactions.length > 0 ? (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent one-time
              <span className="ml-2 text-[10px] font-mono normal-case text-muted-foreground/70">
                last 30 days
              </span>
            </h3>
            <Link
              href="/transactions"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-3 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {(() => {
              // Truly one-off transactions: not a transfer, not auto-posted
              // from a recurring flow (flowId == null). Without the flowId
              // filter, every monthly auto-accrual would clutter this list
              // with its own row even though it's already represented by
              // its parent flow up above.
              const truly = recentTransactions.filter(
                (t) => t.kind !== "transfer" && t.flowId == null,
              );
              const visible = truly.filter((t) => {
                if (tab === "expense") return t.kind === "expense";
                if (tab === "income") return t.kind === "income";
                return true;
              });
              if (truly.length === 0) {
                return (
                  <p className="text-xs text-muted-foreground italic px-1">
                    No one-time transactions yet. Click{" "}
                    <span className="font-mono">One-time</span> above to log one.
                  </p>
                );
              }
              return visible.slice(0, 8).map((t) => (
                <TransactionItem
                  key={t.id}
                  transaction={t}
                  accounts={accountOptions}
                />
              ));
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
