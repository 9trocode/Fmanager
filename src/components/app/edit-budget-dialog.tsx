"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateBudget } from "@/lib/actions/budgets";
import { SUGGESTED_EXPENSE_CATEGORIES } from "@/lib/flows";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { useRole } from "@/components/app/role-context";

export type BudgetEditRow = {
  id: number;
  category: string;
  monthlyLimit: number;
  currency: string;
  notes: string | null;
};

export function EditBudgetDialog({
  budget,
  open,
  onOpenChange,
}: {
  budget: BudgetEditRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit budget</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await updateBudget(fd);
              onOpenChange(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={budget.id} />
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              name="category"
              defaultValue={budget.category}
              list="budget-expense-categories-edit"
              required
              autoFocus
            />
            <datalist id="budget-expense-categories-edit">
              {SUGGESTED_EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="monthlyLimit">Monthly limit</Label>
              <Input
                id="monthlyLimit"
                name="monthlyLimit"
                type="number"
                step="0.01"
                min="0"
                defaultValue={budget.monthlyLimit}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Select name="currency" defaultValue={budget.currency}>
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
              defaultValue={budget.notes ?? ""}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
