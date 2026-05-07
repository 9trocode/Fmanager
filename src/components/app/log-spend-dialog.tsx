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
import { createTransaction } from "@/lib/actions/transactions";
import { useRole } from "@/components/app/role-context";
import { localToday } from "@/lib/dates";

export function LogSpendDialog({
  category,
  currency,
  accountOptions,
  defaultAccountId,
}: {
  category: string;
  currency: string;
  accountOptions: Array<{ id: number; name: string; currency: string }>;
  defaultAccountId?: number | null;
}) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;

  // Prefer accounts in the same currency as the budget.
  const sameCurrency = accountOptions.filter((a) => a.currency === currency);
  const sortedAccounts =
    sameCurrency.length > 0
      ? [...sameCurrency, ...accountOptions.filter((a) => a.currency !== currency)]
      : accountOptions;

  const fallbackAccountId =
    defaultAccountId ?? sortedAccounts[0]?.id ?? undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Log spend
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log spend in {category}</DialogTitle>
          <DialogDescription>
            Records an expense transaction tagged with this category. It will
            count toward this month&apos;s budget total.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await createTransaction(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="kind" value="expense" />
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="currency" value={currency} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount ({currency})</Label>
              <MoneyInput
                id="amount"
                name="amount"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="occurred_at">Date</Label>
              <Input
                id="occurred_at"
                name="occurred_at"
                type="date"
                defaultValue={localToday()}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="account_id">From account</Label>
            <Select
              name="account_id"
              defaultValue={
                fallbackAccountId != null ? String(fallbackAccountId) : undefined
              }
              required
            >
              <SelectTrigger id="account_id">
                <SelectValue placeholder="Pick an account" />
              </SelectTrigger>
              <SelectContent>
                {sortedAccounts.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name} ({a.currency})
                    {a.currency !== currency ? " — different currency" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Mismatched currencies still log fine — but the budget compares in{" "}
              {currency}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" name="notes" placeholder="What was it?" />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={pending || sortedAccounts.length === 0}
              loading={pending}
              loadingText="Logging…"
            >
              Log
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
