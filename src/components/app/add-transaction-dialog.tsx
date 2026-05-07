"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
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
import {
  TransactionFields,
  type TransactionAccountOption,
} from "@/components/app/transaction-form-fields";
import { createTransaction } from "@/lib/actions/transactions";
import type { TransactionKind } from "@/lib/db/schema";

export function AddTransactionDialog({
  accounts,
  defaultKind,
  defaultAccountId,
  trigger,
  size = "sm",
}: {
  accounts: TransactionAccountOption[];
  defaultKind?: TransactionKind;
  defaultAccountId?: number;
  trigger?: React.ReactNode;
  size?: "sm" | "default" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const disabled = accounts.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size={size} disabled={disabled}>
            <Plus className="size-4" />
            New transaction
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New transaction</DialogTitle>
          <DialogDescription>
            Logged transactions adjust the effective balance of the source
            account (and destination, for transfers) on top of its latest
            snapshot.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              try {
                await createTransaction(fd);
                setOpen(false);
                // Confirmation toast — without this, the user clicks
                // "Save", the dialog closes, and they have no signal
                // that anything happened (especially on /cash-flow,
                // where the new tx isn't on screen by default).
                toast.success("Transaction saved", {
                  description: "Visible in Transactions and the runway widget.",
                });
              } catch (err) {
                toast.error(
                  err instanceof Error
                    ? err.message
                    : "Couldn't save the transaction.",
                );
              }
            })
          }
          className="space-y-4"
        >
          <TransactionFields
            accounts={accounts}
            defaultKind={defaultKind}
            defaultAccountId={defaultAccountId}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending} loading={pending}>
              {pending ? "Saving…" : "Save transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
