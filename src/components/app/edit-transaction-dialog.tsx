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
import {
  TransactionFields,
  type TransactionAccountOption,
  type TransactionDefaults,
} from "@/components/app/transaction-form-fields";
import { updateTransaction } from "@/lib/actions/transactions";

export function EditTransactionDialog({
  open,
  onOpenChange,
  accounts,
  transaction,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: TransactionAccountOption[];
  transaction: TransactionDefaults & { id: number };
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit transaction</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await updateTransaction(fd);
              onOpenChange(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={transaction.id} />
          <TransactionFields accounts={accounts} defaults={transaction} />
          <DialogFooter>
            <Button type="submit" disabled={pending} loading={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
