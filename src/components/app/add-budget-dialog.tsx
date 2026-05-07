"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { createBudget } from "@/lib/actions/budgets";
import { SUGGESTED_EXPENSE_CATEGORIES } from "@/lib/flows";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { useRole } from "@/components/app/role-context";

export function AddBudgetDialog({
  baseCurrency,
  trigger,
}: {
  baseCurrency: string;
  trigger?: React.ReactNode;
}) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" />
            New budget
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New budget</DialogTitle>
          <DialogDescription>
            Set a monthly spending limit for a category. Spend is summed from
            transactions in the current month.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await createBudget(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              name="category"
              list="budget-expense-categories"
              placeholder={SUGGESTED_EXPENSE_CATEGORIES[0]}
              required
              autoFocus
            />
            <datalist id="budget-expense-categories">
              {SUGGESTED_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="text-[11px] text-muted-foreground">
              Free-text. Match exactly what you tag transactions with.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="monthlyLimit">Monthly limit</Label>
              <MoneyInput
                id="monthlyLimit"
                name="monthlyLimit"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select name="currency" defaultValue={baseCurrency}>
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
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="What this budget covers, intent, etc."
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending} loading={pending}>
              {pending ? "Saving…" : "Add budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
