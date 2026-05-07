"use client";

import { useState } from "react";
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
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import {
  SUGGESTED_EXPENSE_CATEGORIES,
  SUGGESTED_INCOME_CATEGORIES,
} from "@/lib/flows";
import type { TransactionKind } from "@/lib/db/schema";
import { localToday } from "@/lib/dates";

export type TransactionAccountOption = {
  id: number;
  name: string;
  currency: string;
};

export type TransactionDefaults = {
  id?: number;
  accountId?: number;
  destAccountId?: number | null;
  kind?: TransactionKind;
  amount?: number;
  currency?: string;
  category?: string | null;
  occurredAt?: string;
  notes?: string | null;
};

export function TransactionFields({
  accounts,
  defaults,
  defaultKind = "expense",
  defaultAccountId,
  budgets = [],
}: {
  accounts: TransactionAccountOption[];
  defaults?: TransactionDefaults;
  defaultKind?: TransactionKind;
  defaultAccountId?: number;
  /**
   * Active budgets, used to surface a "Tie to a budget" select on
   * expense transactions. Picking a budget auto-fills the category
   * with the budget's category text — that's what makes the spend
   * count toward the budget cap (budgets aggregate by category).
   */
  budgets?: Array<{ id: number; category: string; currency: string }>;
}) {
  const initialKind = defaults?.kind ?? defaultKind;
  const initialAccountId =
    defaults?.accountId ?? defaultAccountId ?? accounts[0]?.id;
  const initialAccount =
    accounts.find((a) => a.id === initialAccountId) ?? accounts[0];

  const [kind, setKind] = useState<TransactionKind>(initialKind);
  const [accountId, setAccountId] = useState<number | undefined>(
    initialAccountId,
  );
  const [destAccountId, setDestAccountId] = useState<number | undefined>(
    defaults?.destAccountId ?? undefined,
  );
  const [currency, setCurrency] = useState<string>(
    defaults?.currency ?? initialAccount?.currency ?? "USD",
  );

  // Controlled category so the Budget select can write to it. Same
  // pattern as the recurring-flow form — picking a budget sets the
  // text; user can still type a custom category if they want one
  // not tied to a budget.
  const [category, setCategory] = useState<string>(defaults?.category ?? "");
  const initialBudgetId = (() => {
    if (!defaults?.category) return "none";
    const match = budgets.find(
      (b) =>
        b.category.trim().toLowerCase() ===
        defaults.category!.trim().toLowerCase(),
    );
    return match ? String(match.id) : "none";
  })();
  const [budgetId, setBudgetId] = useState<string>(initialBudgetId);

  const today = localToday();

  function handleAccountChange(value: string) {
    const id = Number(value);
    setAccountId(id);
    // Auto-update currency if user hasn't manually changed it from the source's
    // currency. Always safe to align with the source account on switch.
    const acc = accounts.find((a) => a.id === id);
    if (acc) setCurrency(acc.currency);
  }

  const categories =
    kind === "income"
      ? SUGGESTED_INCOME_CATEGORIES
      : SUGGESTED_EXPENSE_CATEGORIES;
  const datalistId = `tx-categories-${kind}`;

  return (
    <div className="space-y-4">
      <div>
        <Tabs
          value={kind}
          onValueChange={(v) => setKind(v as TransactionKind)}
          className="w-full"
        >
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="expense">Expense</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="transfer">Transfer</TabsTrigger>
          </TabsList>
        </Tabs>
        <input type="hidden" name="kind" value={kind} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="account_id">
            {kind === "transfer" ? "From account" : "Account"}
          </Label>
          <Select
            value={accountId != null ? String(accountId) : undefined}
            onValueChange={handleAccountChange}
            name="account_id"
          >
            <SelectTrigger id="account_id">
              <SelectValue placeholder="Select an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name} ({a.currency})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {kind === "transfer" ? (
          <div className="space-y-1.5">
            <Label htmlFor="dest_account_id">To account</Label>
            <Select
              value={destAccountId != null ? String(destAccountId) : undefined}
              onValueChange={(v) => setDestAccountId(Number(v))}
              name="dest_account_id"
            >
              <SelectTrigger id="dest_account_id">
                <SelectValue placeholder="Select destination" />
              </SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} ({a.currency})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              name="category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
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
              list={datalistId}
            />
            <datalist id={datalistId}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        )}
      </div>

      {/*
        Tie this expense to a budget. Picking one sets the category
        text to match — that's how the budget aggregator finds it (it
        sums transactions by category, optionally per-account). Hidden
        for income / transfer kinds since budgets don't apply.
      */}
      {kind === "expense" && budgets.length > 0 ? (
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
            One-time spends counted toward this month&apos;s budget for
            the chosen category.
          </p>
        </div>
      ) : null}

      {kind === "transfer" ? (
        <div className="space-y-1.5">
          <Label htmlFor="category">Category (optional)</Label>
          <Input
            id="category"
            name="category"
            defaultValue={defaults?.category ?? ""}
            placeholder="Internal transfer"
          />
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
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Select
            value={currency}
            onValueChange={setCurrency}
            name="currency"
          >
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
          <Label htmlFor="occurred_at">Date</Label>
          <Input
            id="occurred_at"
            name="occurred_at"
            type="date"
            defaultValue={defaults?.occurredAt ?? today}
            required
            // Invert the calendar icon under the dark theme so the
            // browser-native indicator stays visible against our dark
            // input background.
            className="dark:[color-scheme:dark]"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Vendor, reason, anything worth remembering."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>
    </div>
  );
}
