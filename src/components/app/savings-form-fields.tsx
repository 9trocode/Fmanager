"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
import { Separator } from "@/components/ui/separator";
import { SUPPORTED_CURRENCIES } from "@/lib/format";

const SUGGESTED_CATEGORIES = [
  "Emergency fund",
  "Housing",
  "Travel",
  "Education",
  "Retirement",
  "Family",
  "Tax reserve",
  "Buffer",
  "Other",
];

const DEBT_SUGGESTED_CATEGORIES = [
  "Mortgage",
  "Student loan",
  "Auto loan",
  "Credit card",
  "Business loan",
  "Personal loan",
  "Other",
];

export type GoalKindOption = "savings" | "net_worth" | "fire" | "debt_payoff";

export type GoalFieldsValue = {
  kind?: GoalKindOption;
  name?: string;
  category?: string | null;
  targetAmount?: number | null;
  currentAmount?: number;
  currency?: string;
  monthlyContribution?: number;
  expectedReturnPct?: number;
  horizonMonths?: number;
  targetDate?: string | null;
  fireMultiplier?: number | null;
  startedAt?: string;
  accountId?: number | null;
  notes?: string | null;
};

const KIND_LABEL: Record<GoalKindOption, string> = {
  savings: "Savings goal — save toward a target",
  net_worth: "Net worth target — reach a total net worth",
  fire: "Financial independence — annual expenses × multiplier",
  debt_payoff: "Debt payoff — drive a loan to zero",
};

type AccountOption = {
  id: number;
  name: string;
  currency: string;
  type?: string;
};

export function SavingsGoalFields({
  defaults,
  accountOptions,
}: {
  defaults?: GoalFieldsValue;
  accountOptions: AccountOption[];
}) {
  // Make the form reactive to goal kind so we can hide irrelevant fields
  // (e.g. "Expected return %" doesn't apply to debt payoff — there's no
  // yield on principal payments — and "FIRE multiplier" only applies to
  // FIRE goals).
  const [kind, setKind] = useState<GoalKindOption>(defaults?.kind ?? "savings");

  const isSavings = kind === "savings";
  const isNetWorth = kind === "net_worth";
  const isFire = kind === "fire";
  const isDebt = kind === "debt_payoff";

  // For debt payoff, only loan accounts make sense — surface them, prefer
  // them in the dropdown, and require selection.
  const loanAccounts = accountOptions.filter((a) => a.type === "loan");
  const cashAccounts = accountOptions.filter((a) => a.type !== "loan");

  // Default linked-account behavior: for debt payoff, auto-pick the only
  // loan account if there's exactly one, since the field is required.
  const initialAccountId = (() => {
    if (defaults?.accountId != null) return String(defaults.accountId);
    if (isDebt && loanAccounts.length === 1) return String(loanAccounts[0].id);
    return "none";
  })();
  const [accountId, setAccountId] = useState(initialAccountId);

  const categories = isDebt ? DEBT_SUGGESTED_CATEGORIES : SUGGESTED_CATEGORIES;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="kind">Goal type</Label>
        <Select
          value={kind}
          onValueChange={(v) => setKind(v as GoalKindOption)}
        >
          <SelectTrigger id="kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["savings", "net_worth", "fire", "debt_payoff"] as const).map(
              (k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
        {/*
          Hidden input mirrors the controlled select so the server action
          receives the value via FormData. (Radix Select with `name` is
          inconsistent across versions; the hidden input is the safer path.)
        */}
        <input type="hidden" name="kind" value={kind} />
        <p className="text-[10px] text-muted-foreground">
          {isSavings &&
            "Manually-tracked savings target. Yield grows the balance toward the goal."}
          {isNetWorth &&
            "Tracks your real balance sheet (floor net worth). Contribution + yield project the path to target."}
          {isFire &&
            "Target = annual expenses × multiplier. Tracks your real balance sheet against that number."}
          {isDebt &&
            "Pays down a linked loan account toward zero. No yield — payments go straight against principal."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaults?.name ?? ""}
            placeholder={
              isDebt
                ? "Pay off mortgage / Clear student loan"
                : "Emergency fund / $1M club / FIRE / Mortgage"
            }
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            name="category"
            defaultValue={defaults?.category ?? ""}
            placeholder={categories[0]}
            list="savings-categories"
          />
          <datalist id="savings-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      {/*
        Debt payoff: linked LOAN ACCOUNT is required and lives at the top
        level (not buried in optional details) because the entire goal is
        anchored on it. The current loan balance drives the progress bar.
      */}
      {isDebt ? (
        <div className="space-y-1.5">
          <Label htmlFor="account_id">Loan account</Label>
          <input type="hidden" name="account_id" value={accountId} />
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="account_id">
              <SelectValue
                placeholder={
                  loanAccounts.length === 0
                    ? "Add a loan/debt account first"
                    : "Pick the loan to pay down"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">— none —</span>
              </SelectItem>
              {loanAccounts.length > 0 ? (
                loanAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} ({a.currency}) · loan
                  </SelectItem>
                ))
              ) : null}
              {/* Cash accounts are listed too but visually de-emphasized,
                  in case the user really did mean to track a non-loan
                  account here. */}
              {cashAccounts.length > 0 ? (
                cashAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} ({a.currency})
                  </SelectItem>
                ))
              ) : null}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Progress is computed from this loan&apos;s current balance vs
            the original loan amount below.
          </p>
        </div>
      ) : null}

      {/*
        Amount + currency row. Field meaning shifts by goal kind, so labels
        and helper copy follow suit. FIRE hides Target (it's computed from
        expenses × multiplier) and Saved (it comes from net worth).
      */}
      {isFire ? (
        <div className="grid grid-cols-1 gap-3 max-w-[12rem]">
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Select name="currency" defaultValue={defaults?.currency ?? "USD"}>
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
            <p className="text-[10px] text-muted-foreground">
              Target = annual expenses × multiplier (computed live).
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="target_amount">
              {isDebt ? "Original loan" : isNetWorth ? "Target net worth" : "Target"}
            </Label>
            <MoneyInput
              id="target_amount"
              name="target_amount"
              defaultValue={defaults?.targetAmount ?? null}
              placeholder={isDebt ? "1,000,000" : "50,000"}
              required={isDebt}
            />
            <p className="text-[10px] text-muted-foreground">
              {isDebt ? "Used to compute % paid off." : "Optional."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="current_amount">
              {isDebt
                ? "Already paid"
                : isNetWorth
                  ? "Current (auto)"
                  : "Saved so far"}
            </Label>
            {isNetWorth ? (
              <Input
                id="current_amount"
                name="current_amount"
                value="0"
                readOnly
                disabled
                className="text-muted-foreground"
              />
            ) : (
              <MoneyInput
                id="current_amount"
                name="current_amount"
                defaultValue={defaults?.currentAmount ?? 0}
                required={!isDebt}
              />
            )}
            {isDebt ? (
              <p className="text-[10px] text-muted-foreground">
                Optional. Defaults to 0.
              </p>
            ) : isNetWorth ? (
              <p className="text-[10px] text-muted-foreground">
                Tracked from balance sheet.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Select name="currency" defaultValue={defaults?.currency ?? "USD"}>
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
        </div>
      )}

      {/*
        Monthly contribution + (return % | length) row.
        - Debt payoff has no expected return — yield doesn't apply to a
          loan you're paying down. Hide that column entirely; widen the
          payment + length columns so the row doesn't look uneven.
        - Other kinds show all three.
      */}
      {isDebt ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="monthly_contribution"
              className="min-h-[2.25rem] items-start leading-tight"
            >
              Monthly payment
            </Label>
            <MoneyInput
              id="monthly_contribution"
              name="monthly_contribution"
              defaultValue={defaults?.monthlyContribution ?? 0}
              required
            />
            <p className="text-[10px] text-muted-foreground">
              Principal portion. Interest isn&apos;t modeled in ETA.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="horizon_months"
              className="min-h-[2.25rem] items-start leading-tight"
            >
              Length (months)
            </Label>
            <Input
              id="horizon_months"
              name="horizon_months"
              type="number"
              step="1"
              min="1"
              defaultValue={defaults?.horizonMonths ?? 60}
              required
            />
            <p className="text-[10px] text-muted-foreground">
              Used for the projection chart, not the ETA.
            </p>
          </div>
          {/* Hidden zero so the schema column always gets a value. */}
          <input type="hidden" name="expected_return_pct" value="0" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="monthly_contribution"
              className="min-h-[2.25rem] items-start leading-tight"
            >
              Monthly contribution
            </Label>
            <MoneyInput
              id="monthly_contribution"
              name="monthly_contribution"
              defaultValue={defaults?.monthlyContribution ?? 0}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="expected_return_pct"
              className="min-h-[2.25rem] items-start leading-tight"
            >
              Expected return %
            </Label>
            <Input
              id="expected_return_pct"
              name="expected_return_pct"
              type="number"
              step="0.5"
              min="0"
              max="20"
              defaultValue={defaults?.expectedReturnPct ?? 4}
            />
            <p className="text-[10px] text-muted-foreground">
              ~0% cash, ~4% HYSA, ~7% index.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="horizon_months"
              className="min-h-[2.25rem] items-start leading-tight"
            >
              Length (months)
            </Label>
            <Input
              id="horizon_months"
              name="horizon_months"
              type="number"
              step="1"
              min="1"
              defaultValue={defaults?.horizonMonths ?? 18}
              required
            />
          </div>
        </div>
      )}

      {/*
        Target date + FIRE multiplier row. FIRE multiplier is only relevant
        for FIRE goals; hide it everywhere else so it doesn't suggest the
        user can configure something that won't be read.
      */}
      <div className={isFire ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "grid grid-cols-1 gap-3"}>
        <div className="space-y-1.5">
          <Label htmlFor="target_date">Target date (optional)</Label>
          <Input
            id="target_date"
            name="target_date"
            type="date"
            defaultValue={defaults?.targetDate ?? ""}
          />
          <p className="text-[10px] text-muted-foreground">
            {isDebt
              ? "When you want this loan cleared by."
              : isNetWorth
                ? "When you want to hit the target."
                : "Used by Net worth and Debt payoff goals."}
          </p>
        </div>
        {isFire ? (
          <div className="space-y-1.5">
            <Label htmlFor="fire_multiplier">FIRE multiplier</Label>
            <Input
              id="fire_multiplier"
              name="fire_multiplier"
              type="number"
              step="1"
              min="10"
              max="50"
              defaultValue={defaults?.fireMultiplier ?? 25}
              placeholder="25"
            />
            <p className="text-[10px] text-muted-foreground">
              25× = 4% rule (default).
            </p>
          </div>
        ) : (
          // Send a sentinel so the column is always populated server-side.
          <input
            type="hidden"
            name="fire_multiplier"
            value={defaults?.fireMultiplier ?? ""}
          />
        )}
      </div>

      <Separator className="my-2" />

      <details className="group [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none">
        <summary className="cursor-pointer text-sm font-medium select-none flex items-center justify-between gap-2 rounded-md py-1 px-1 -mx-1 hover:bg-secondary/40 transition-colors">
          <span>
            Optional details{" "}
            <span className="text-muted-foreground font-normal">
              {isDebt ? "(start, notes)" : "(start, account, notes)"}
            </span>
          </span>
          <ChevronDown className="size-4 text-muted-foreground shrink-0 transition-transform duration-150 group-open:-rotate-180" />
        </summary>

        <div className="space-y-4 mt-4">
          <div className={isDebt ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
            <div className="space-y-1.5">
              <Label htmlFor="started_at">Started on</Label>
              <Input
                id="started_at"
                name="started_at"
                type="date"
                defaultValue={
                  defaults?.startedAt ?? new Date().toISOString().slice(0, 10)
                }
              />
            </div>
            {/*
              Linked account doesn't apply to debt payoff (the loan account
              is captured up top) or FIRE (which is whole-balance-sheet).
              For savings + net_worth it's optional context.
            */}
            {!isDebt && !isFire ? (
              <div className="space-y-1.5">
                <Label htmlFor="account_id">Linked account (optional)</Label>
                <Select
                  name="account_id"
                  defaultValue={
                    defaults?.accountId != null
                      ? String(defaults.accountId)
                      : "none"
                  }
                >
                  <SelectTrigger id="account_id">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— none —</SelectItem>
                    {accountOptions.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name} ({a.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Where the money lives. Reference only.
                </p>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={defaults?.notes ?? ""}
              placeholder={
                isDebt
                  ? "Rate, lender, payoff strategy, etc."
                  : "Why this goal matters, deadlines, etc."
              }
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
