"use client";

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

export type GoalFieldsValue = {
  name?: string;
  category?: string | null;
  targetAmount?: number | null;
  currentAmount?: number;
  currency?: string;
  monthlyContribution?: number;
  expectedReturnPct?: number;
  horizonMonths?: number;
  startedAt?: string;
  accountId?: number | null;
  notes?: string | null;
};

export function SavingsGoalFields({
  defaults,
  accountOptions,
}: {
  defaults?: GoalFieldsValue;
  accountOptions: Array<{ id: number; name: string; currency: string }>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaults?.name ?? ""}
            placeholder="Emergency fund"
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
            placeholder={SUGGESTED_CATEGORIES[0]}
            list="savings-categories"
          />
          <datalist id="savings-categories">
            {SUGGESTED_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="target_amount">Target</Label>
          <MoneyInput
            id="target_amount"
            name="target_amount"
            defaultValue={defaults?.targetAmount ?? null}
            placeholder="50,000"
          />
          <p className="text-[10px] text-muted-foreground">Optional.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="current_amount">Saved so far</Label>
          <MoneyInput
            id="current_amount"
            name="current_amount"
            defaultValue={defaults?.currentAmount ?? 0}
            required
          />
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

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="monthly_contribution">Monthly contribution</Label>
          <MoneyInput
            id="monthly_contribution"
            name="monthly_contribution"
            defaultValue={defaults?.monthlyContribution ?? 0}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expected_return_pct">Expected return %</Label>
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
          <Label htmlFor="horizon_months">Length (months)</Label>
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

      <Separator className="my-2" />

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium select-none flex items-center justify-between">
          <span>
            Optional details{" "}
            <span className="text-muted-foreground font-normal">(start, account, notes)</span>
          </span>
          <span className="text-[11px] text-muted-foreground group-open:rotate-90 transition-transform">
            ›
          </span>
        </summary>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label htmlFor="account_id">Linked account (optional)</Label>
              <Select
                name="account_id"
                defaultValue={
                  defaults?.accountId != null ? String(defaults.accountId) : "none"
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={defaults?.notes ?? ""}
              placeholder="Why this goal matters, deadlines, etc."
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
