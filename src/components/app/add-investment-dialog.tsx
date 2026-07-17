"use client";

import { useState, useTransition } from "react";
import { TrendingUp } from "lucide-react";
import { createAccount } from "@/lib/actions/accounts";
import { localToday } from "@/lib/dates";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { useRole } from "@/components/app/role-context";
import { MoneyInput } from "@/components/app/money-input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AddInvestmentDialog() {
  const role = useRole();
  const today = localToday();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (role === "viewer") return null;

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setErrorMessage(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <TrendingUp className="size-4" />
          Add investment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record an investment</DialogTitle>
          <DialogDescription>
            Enter its current value. It will be included in net worth and you
            can add new value snapshots as it changes.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(formData) =>
            startTransition(async () => {
              setErrorMessage(null);
              try {
                await createAccount(formData);
                setOpen(false);
              } catch {
                setErrorMessage(
                  "We could not save this investment. Check the values and try again.",
                );
              }
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="type" value="investment" />

          <div className="space-y-1.5">
            <Label htmlFor="investment_name">Investment name</Label>
            <Input
              id="investment_name"
              name="name"
              placeholder="S&P 500 ETF, Treasury bills, private fund…"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment_institution">
              Provider or platform (optional)
            </Label>
            <Input
              id="investment_institution"
              name="institution"
              placeholder="Fidelity, Bamboo, Rise, bank…"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="investment_currency">Currency</Label>
              <Select name="currency" defaultValue="USD">
                <SelectTrigger id="investment_currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="investment_value">Current value</Label>
              <MoneyInput
                id="investment_value"
                name="opening_balance"
                required
                autoFocus={false}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment_as_of">Value as of</Label>
            <Input
              id="investment_as_of"
              name="as_of"
              type="date"
              defaultValue={today}
              max={today}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="investment_notes">Notes (optional)</Label>
            <textarea
              id="investment_notes"
              name="notes"
              rows={3}
              placeholder="Units held, target, lock-up, or anything useful."
              className="flex w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending} loading={pending}>
              {pending ? "Saving…" : "Save investment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
