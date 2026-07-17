"use client";

import { useState, useTransition } from "react";
import {
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Landmark,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
  TrendingDown,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
import { useRole } from "@/components/app/role-context";
import {
  createDebtPlan,
  deleteDebtPayment,
  deleteDebtPlan,
  recordDebtPayment,
  updateDebtPlan,
} from "@/lib/actions/debts";
import type { DebtProjection } from "@/lib/debt-calculations";
import type { AccountType } from "@/lib/db/schema";
import { formatMoney, SUPPORTED_CURRENCIES } from "@/lib/format";
import { localToday } from "@/lib/dates";

interface SourceAccountOption {
  id: number;
  name: string;
  currency: string;
  type: AccountType;
}

interface LoanOption {
  id: number;
  name: string;
  institution: string | null;
  currency: string;
  balance: number;
  originalPrincipal: number | null;
  interestRatePct: number | null;
  loanTermMonths: number | null;
}

export interface DebtPlanView {
  id: number;
  active: boolean;
  monthlyPayment: number;
  nextPaymentDate: string;
  notes: string | null;
  loan: LoanOption;
  source: { id: number; name: string; currency: string };
  projection: DebtProjection;
  payments: Array<{
    id: number;
    paidAt: string;
    totalAmount: number;
    principalAmount: number;
    interestAmount: number;
    remainingBalance: number;
    currency: string;
  }>;
}

interface DebtSummary {
  totalDebt: number;
  monthlyPayments: number;
  monthlyInterest: number;
  monthlyPrincipal: number;
  monthlyIncome: number;
  cashAfterCommitments: number;
  liquidCash: number;
  runwayMonths: number | null;
  runwayWithoutDebt: number | null;
}

function nextMonthYmd(): string {
  const [year, month, day] = localToday().split("-").map(Number);
  const next = new Date(year, month, 1);
  const lastDay = new Date(
    next.getFullYear(),
    next.getMonth() + 1,
    0,
  ).getDate();
  next.setDate(Math.min(day, lastDay));
  return [
    next.getFullYear(),
    String(next.getMonth() + 1).padStart(2, "0"),
    String(next.getDate()).padStart(2, "0"),
  ].join("-");
}

function payoffLabel(months: number | null): string {
  if (months == null) return "No payoff at this payment";
  if (months === 0) return "Paid off";
  if (months < 24) return `${months} months`;
  const years = months / 12;
  return `${years.toFixed(years < 10 ? 1 : 0)} years`;
}

function runwayLabel(months: number | null): string {
  if (months == null) return "∞";
  return `${months.toFixed(1)} mo`;
}

function SourceAccountSelect({
  accounts,
  defaultValue,
}: {
  accounts: SourceAccountOption[];
  defaultValue?: number;
}) {
  const initial = String(defaultValue ?? accounts[0]?.id ?? "");
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="source_account_id">Repay from</Label>
      <input type="hidden" name="source_account_id" value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id="source_account_id">
          <SelectValue placeholder="Choose a cash account" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={String(account.id)}>
              {account.name} · {account.currency}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground">
        Principal and interest both leave this account when you record a
        payment.
      </p>
    </div>
  );
}

function PlanFields({
  sources,
  loan,
  monthlyPayment,
  nextPaymentDate,
  notes,
  sourceAccountId,
  showActive,
  active,
}: {
  sources: SourceAccountOption[];
  loan?: LoanOption;
  monthlyPayment?: number;
  nextPaymentDate?: string;
  notes?: string | null;
  sourceAccountId?: number;
  showActive?: boolean;
  active?: boolean;
}) {
  const [activeValue, setActiveValue] = useState(
    active === false ? "false" : "true",
  );
  return (
    <div className="space-y-4">
      {loan ? (
        <input type="hidden" name="loan_account_id" value={loan.id} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="interest_rate_pct">Interest rate (% APR)</Label>
          <Input
            id="interest_rate_pct"
            name="interest_rate_pct"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={loan?.interestRatePct ?? ""}
            placeholder="e.g. 18.5"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="loan_term_months">Original term (months)</Label>
          <Input
            id="loan_term_months"
            name="loan_term_months"
            type="number"
            min="1"
            step="1"
            defaultValue={loan?.loanTermMonths ?? ""}
            placeholder="e.g. 36"
          />
        </div>
      </div>
      {loan ? (
        <div className="space-y-1.5">
          <Label htmlFor="original_principal">Original principal</Label>
          <MoneyInput
            id="original_principal"
            name="original_principal"
            defaultValue={loan.originalPrincipal ?? loan.balance}
          />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="monthly_payment">Monthly payment</Label>
          <MoneyInput
            id="monthly_payment"
            name="monthly_payment"
            defaultValue={monthlyPayment ?? null}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next_payment_date">Next payment date</Label>
          <Input
            id="next_payment_date"
            name="next_payment_date"
            type="date"
            defaultValue={nextPaymentDate ?? nextMonthYmd()}
            required
          />
        </div>
      </div>
      <SourceAccountSelect accounts={sources} defaultValue={sourceAccountId} />
      {showActive ? (
        <div className="space-y-1.5">
          <Label htmlFor="active">Plan status</Label>
          <input type="hidden" name="active" value={activeValue} />
          <Select value={activeValue} onValueChange={setActiveValue}>
            <SelectTrigger id="active">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Active — include in finances</SelectItem>
              <SelectItem value="false">
                Paused — exclude from forecasts
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={notes ?? ""}
          className="flex w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Refinance terms, lender contact, penalty notes…"
        />
      </div>
    </div>
  );
}

function AddDebtDialog({ sources }: { sources: SourceAccountOption[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [currency, setCurrency] = useState(sources[0]?.currency ?? "USD");

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        await createDebtPlan(formData);
        toast.success("Debt and repayment plan created.");
        setOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Couldn't create debt.",
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={sources.length === 0}>
          <Plus className="size-4" />
          Add debt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add debt</DialogTitle>
          <DialogDescription>
            Record the current balance and the payment you are committing to
            each month.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Debt name</Label>
              <Input id="name" name="name" placeholder="Car loan" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="institution">Lender</Label>
              <Input
                id="institution"
                name="institution"
                placeholder="Bank or lender"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="current_balance">Current balance</Label>
              <MoneyInput
                id="current_balance"
                name="current_balance"
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
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <PlanFields sources={sources} />
          <DialogFooter>
            <Button type="submit" loading={pending} disabled={pending}>
              {pending ? "Creating…" : "Create debt plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SetupPlanDialog({
  loan,
  sources,
}: {
  loan: LoanOption;
  sources: SourceAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={sources.length === 0}>
          Set up repayment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Plan {loan.name}</DialogTitle>
          <DialogDescription>
            Current balance: {formatMoney(loan.balance, loan.currency)}.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) =>
            startTransition(async () => {
              try {
                await createDebtPlan(formData);
                toast.success("Repayment plan created.");
                setOpen(false);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Couldn't save plan.",
                );
              }
            })
          }
          className="space-y-4"
        >
          <PlanFields sources={sources} loan={loan} />
          <DialogFooter>
            <Button type="submit" loading={pending} disabled={pending}>
              {pending ? "Saving…" : "Save repayment plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditPlanDialog({
  plan,
  sources,
}: {
  plan: DebtPlanView;
  sources: SourceAccountOption[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="size-4" /> Edit plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {plan.loan.name}</DialogTitle>
        </DialogHeader>
        <form
          action={(formData) =>
            startTransition(async () => {
              try {
                await updateDebtPlan(formData);
                toast.success("Repayment plan updated.");
                setOpen(false);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Couldn't update plan.",
                );
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={plan.id} />
          <PlanFields
            sources={sources}
            loan={plan.loan}
            monthlyPayment={plan.monthlyPayment}
            nextPaymentDate={plan.nextPaymentDate}
            notes={plan.notes}
            sourceAccountId={plan.source.id}
            showActive
            active={plan.active}
          />
          <DialogFooter>
            <Button type="submit" loading={pending} disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentDialog({ plan }: { plan: DebtPlanView }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={!plan.active}>
          <ReceiptText className="size-4" /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record debt payment</DialogTitle>
          <DialogDescription>
            The payment is split into principal and estimated monthly interest.
            Cash and debt balances update together.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) =>
            startTransition(async () => {
              try {
                const result = await recordDebtPayment(formData);
                toast.success(
                  `Recorded ${formatMoney(result.total, plan.loan.currency)} · ${formatMoney(result.principal, plan.loan.currency)} principal.`,
                );
                setOpen(false);
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "Couldn't record payment.",
                );
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="plan_id" value={plan.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`amount-${plan.id}`}>Total payment</Label>
              <MoneyInput
                id={`amount-${plan.id}`}
                name="amount"
                defaultValue={plan.monthlyPayment}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`paid-at-${plan.id}`}>Payment date</Label>
              <Input
                id={`paid-at-${plan.id}`}
                name="paid_at"
                type="date"
                defaultValue={
                  plan.nextPaymentDate > localToday()
                    ? localToday()
                    : plan.nextPaymentDate
                }
                max={localToday()}
                required
              />
            </div>
          </div>
          <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estimated interest</span>
              <span className="font-mono">
                {formatMoney(
                  plan.projection.monthlyInterest,
                  plan.loan.currency,
                )}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Estimated principal</span>
              <span className="font-mono text-emerald-300">
                {formatMoney(
                  plan.projection.firstPrincipal,
                  plan.loan.currency,
                )}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" loading={pending} disabled={pending}>
              {pending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeletePlanButton({ plan }: { plan: DebtPlanView }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive">
          <Trash2 className="size-4" /> Remove plan
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this repayment plan?</AlertDialogTitle>
          <AlertDialogDescription>
            The debt account and recorded financial transactions stay intact.
            The monthly forecast and repayment history view are removed, and you
            can create a new plan later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              const formData = new FormData();
              formData.set("id", String(plan.id));
              startTransition(async () => {
                try {
                  await deleteDebtPlan(formData);
                  toast.success("Repayment plan removed.");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Couldn't remove plan.",
                  );
                }
              });
            }}
          >
            {pending ? "Removing…" : "Remove plan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeletePaymentButton({
  paymentId,
  currency,
  totalAmount,
}: {
  paymentId: number;
  currency: string;
  totalAmount: number;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Correct latest payment"
          title="Remove and re-enter this payment"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Correct this payment?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the latest {formatMoney(totalAmount, currency)}
            repayment and both of its principal and interest entries. You can
            then record it again with the correct amount or date.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => {
              const formData = new FormData();
              formData.set("id", String(paymentId));
              startTransition(async () => {
                try {
                  await deleteDebtPayment(formData);
                  toast.success("Payment removed. Record the corrected entry.");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Couldn't correct payment.",
                  );
                }
              });
            }}
          >
            {pending ? "Removing…" : "Remove payment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-3.5" />
          {label}
        </CardDescription>
        <CardTitle className="font-mono text-2xl tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-[11px] text-muted-foreground">
        {detail}
      </CardContent>
    </Card>
  );
}

export function DebtManager({
  baseCurrency,
  plans,
  unplannedLoans,
  sourceAccounts,
  summary,
}: {
  baseCurrency: string;
  plans: DebtPlanView[];
  unplannedLoans: LoanOption[];
  sourceAccounts: SourceAccountOption[];
  summary: DebtSummary;
}) {
  const role = useRole();
  const canEdit = role !== "viewer";
  const paymentShare =
    summary.monthlyIncome > 0
      ? (summary.monthlyPayments / summary.monthlyIncome) * 100
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {plans.filter((plan) => plan.active).length} active plan
          {plans.filter((plan) => plan.active).length === 1 ? "" : "s"}
        </div>
        {canEdit ? <AddDebtDialog sources={sourceAccounts} /> : null}
      </div>

      {sourceAccounts.length === 0 && canEdit ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-200">
            Add a cash or bank account first—the repayment plan needs to know
            where payments leave from.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total debt"
          value={formatMoney(summary.totalDebt, baseCurrency, {
            compact: true,
          })}
          detail="Outstanding loan balances in your base currency."
          icon={Landmark}
        />
        <SummaryCard
          label="Monthly commitment"
          value={formatMoney(summary.monthlyPayments, baseCurrency, {
            compact: true,
          })}
          detail={
            paymentShare == null
              ? "Add monthly income to see affordability."
              : `${paymentShare.toFixed(1)}% of recurring monthly income.`
          }
          icon={WalletCards}
        />
        <SummaryCard
          label="Principal next month"
          value={formatMoney(summary.monthlyPrincipal, baseCurrency, {
            compact: true,
          })}
          detail={`${formatMoney(summary.monthlyInterest, baseCurrency, { compact: true })} is estimated interest cost.`}
          icon={TrendingDown}
        />
        <SummaryCard
          label="Cash after commitments"
          value={formatMoney(summary.cashAfterCommitments, baseCurrency, {
            compact: true,
            signed: true,
          })}
          detail={`Runway ${runwayLabel(summary.runwayMonths)} with debt vs ${runwayLabel(summary.runwayWithoutDebt)} without.`}
          icon={CircleDollarSign}
        />
      </div>

      {plans.length === 0 && unplannedLoans.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Landmark className="size-6" />
            </div>
            <div>
              <div className="font-medium">No debt recorded</div>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Add a loan balance and monthly payment to see the payoff
                timeline and the impact on cash flow and net worth.
              </p>
            </div>
            {canEdit ? <AddDebtDialog sources={sourceAccounts} /> : null}
          </CardContent>
        </Card>
      ) : null}

      {unplannedLoans.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Needs a repayment plan</h2>
            <p className="text-xs text-muted-foreground">
              These loan accounts already affect net worth, but their monthly
              cash commitment is not forecast yet.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {unplannedLoans.map((loan) => (
              <Card key={loan.id}>
                <CardHeader>
                  <CardDescription>
                    {loan.institution ?? "Loan account"}
                  </CardDescription>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span>{loan.name}</span>
                    <span className="font-mono text-destructive">
                      {formatMoney(loan.balance, loan.currency)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {canEdit ? (
                    <SetupPlanDialog loan={loan} sources={sourceAccounts} />
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {plans.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Repayment plans</h2>
            <p className="text-xs text-muted-foreground">
              Payment forecasts use the current balance and APR. Record each
              real payment to keep balances and the principal/interest split
              current.
            </p>
          </div>
          <div className="space-y-4">
            {plans.map((plan) => {
              const original = Math.max(
                plan.loan.originalPrincipal ?? plan.loan.balance,
                plan.loan.balance,
              );
              const paidPct =
                original > 0
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        ((original - plan.loan.balance) / original) * 100,
                      ),
                    )
                  : 0;
              return (
                <Card
                  key={plan.id}
                  className={!plan.active ? "opacity-70" : undefined}
                >
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle>{plan.loan.name}</CardTitle>
                          <Badge
                            variant={plan.active ? "secondary" : "outline"}
                          >
                            {plan.active ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <CardDescription className="mt-1">
                          {plan.loan.institution ?? "Debt"} · paid from{" "}
                          {plan.source.name}
                        </CardDescription>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-2xl text-destructive">
                          {formatMoney(plan.loan.balance, plan.loan.currency)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          remaining
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{paidPct.toFixed(0)}% paid down</span>
                        <span>
                          {formatMoney(original, plan.loan.currency)} original
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{ width: `${paidPct}%` }}
                        />
                      </div>
                    </div>
                    {!plan.projection.isAmortizing ? (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                        The monthly payment does not exceed estimated interest.
                        Increase it above{" "}
                        {formatMoney(
                          plan.projection.monthlyInterest,
                          plan.loan.currency,
                        )}{" "}
                        to make progress.
                      </div>
                    ) : null}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Monthly payment
                        </div>
                        <div className="font-mono">
                          {formatMoney(plan.monthlyPayment, plan.loan.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Principal / interest
                        </div>
                        <div className="font-mono text-sm">
                          <span className="text-emerald-300">
                            {formatMoney(
                              plan.projection.firstPrincipal,
                              plan.loan.currency,
                            )}
                          </span>{" "}
                          /{" "}
                          {formatMoney(
                            plan.projection.monthlyInterest,
                            plan.loan.currency,
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Time to payoff
                        </div>
                        <div className="font-mono">
                          {payoffLabel(plan.projection.monthsToPayoff)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Debt-free date
                        </div>
                        <div className="font-mono">
                          {plan.projection.payoffDate ?? "—"}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3 rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Next due</span>
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono">
                          <CalendarClock className="size-3.5" />
                          {plan.nextPaymentDate}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Total future interest
                        </span>
                        <div className="mt-0.5 font-mono">
                          {plan.projection.totalInterest == null
                            ? "—"
                            : formatMoney(
                                plan.projection.totalInterest,
                                plan.loan.currency,
                              )}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">APR</span>
                        <div className="mt-0.5 font-mono">
                          {(plan.loan.interestRatePct ?? 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <RecordPaymentDialog plan={plan} />
                        <EditPlanDialog plan={plan} sources={sourceAccounts} />
                        <DeletePlanButton plan={plan} />
                      </div>
                    ) : null}
                    {plan.payments.length > 0 ? (
                      <div className="border-t border-border pt-4">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="size-4 text-emerald-300" />{" "}
                          Payment history
                        </div>
                        <div className="space-y-2">
                          {plan.payments.map((payment, paymentIndex) => (
                            <div
                              key={payment.id}
                              className="grid grid-cols-2 gap-2 rounded-md bg-secondary/30 px-3 py-2 text-xs sm:grid-cols-5"
                            >
                              <span className="font-mono">
                                {payment.paidAt}
                              </span>
                              <span>
                                {formatMoney(
                                  payment.totalAmount,
                                  payment.currency,
                                )}
                              </span>
                              <span className="text-emerald-300">
                                {formatMoney(
                                  payment.principalAmount,
                                  payment.currency,
                                )}{" "}
                                principal
                              </span>
                              <span>
                                {formatMoney(
                                  payment.interestAmount,
                                  payment.currency,
                                )}{" "}
                                interest
                              </span>
                              <span className="text-right text-muted-foreground">
                                {formatMoney(
                                  payment.remainingBalance,
                                  payment.currency,
                                )}{" "}
                                left
                              </span>
                              {canEdit && paymentIndex === 0 ? (
                                <div className="col-span-2 flex justify-end sm:col-span-5">
                                  <DeletePaymentButton
                                    paymentId={payment.id}
                                    currency={payment.currency}
                                    totalAmount={payment.totalAmount}
                                  />
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
