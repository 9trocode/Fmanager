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
      <DialogContent className="max-w-lg">
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
              await createTransaction(fd);
              setOpen(false);
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
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
