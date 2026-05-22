"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/app/money-input";
import { EditTransactionDialog } from "@/components/app/edit-transaction-dialog";
import type {
  TransactionAccountOption,
  TransactionDefaults,
} from "@/components/app/transaction-form-fields";
import {
  deleteSnapshot,
  updateSnapshot,
} from "@/lib/actions/accounts";
import { deleteTransaction } from "@/lib/actions/transactions";
import { useRole } from "@/components/app/role-context";

/**
 * Per-transaction inline edit/delete control rendered on the account
 * detail "How this is computed" panel. Edit reuses the same dialog as
 * the /transactions page; delete prompts then removes the row — the
 * page revalidates and the running balance recomputes on the next
 * render.
 */
export function DerivationTxActions({
  transaction,
  accounts,
}: {
  transaction: TransactionDefaults & { id: number };
  accounts: TransactionAccountOption[];
}) {
  const role = useRole();
  const [editOpen, setEditOpen] = useState(false);
  const [, startTransition] = useTransition();
  if (role === "viewer") return null;

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", String(transaction.id));
    startTransition(async () => {
      try {
        await deleteTransaction(fd);
        toast.success("Transaction deleted.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't delete.",
        );
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
                <AlertDialogDescription>
                  Permanent. The account balance will recompute without
                  this row.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditTransactionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        accounts={accounts}
        transaction={transaction}
      />
    </>
  );
}

/**
 * Edit/delete the SNAPSHOT that anchors the running balance derivation.
 * Editing changes the snapshot's value or as-of date; the derivation
 * recomputes against the new anchor on next render. Deleting the latest
 * snapshot promotes the previous one (or falls back to no anchor).
 */
export function SnapshotRowActions({
  snapshotId,
  accountId,
  defaultValue,
  defaultAsOf,
  currency,
}: {
  snapshotId: number;
  accountId: number;
  defaultValue: number;
  defaultAsOf: string;
  currency: string;
}) {
  const role = useRole();
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", String(snapshotId));
    fd.set("account_id", String(accountId));
    startTransition(async () => {
      try {
        await deleteSnapshot(fd);
        toast.success("Snapshot deleted.");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't delete.",
        );
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil className="size-4" />
            Edit snapshot
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete snapshot
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this snapshot?</AlertDialogTitle>
                <AlertDialogDescription>
                  Removes the anchor for the running balance. If an older
                  snapshot exists, it becomes the new anchor; otherwise
                  the running total starts from zero.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit snapshot</DialogTitle>
            <DialogDescription>
              The running balance recomputes from this anchor on save.
            </DialogDescription>
          </DialogHeader>
          <form
            action={(fd) =>
              startTransition(async () => {
                try {
                  await updateSnapshot(fd);
                  toast.success("Snapshot updated.");
                  setEditOpen(false);
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Couldn't save.",
                  );
                }
              })
            }
            className="space-y-4"
          >
            <input type="hidden" name="id" value={snapshotId} />
            <input type="hidden" name="account_id" value={accountId} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="snapshot_value">Balance ({currency})</Label>
                <MoneyInput
                  id="snapshot_value"
                  name="value"
                  defaultValue={defaultValue}
                  allowNegative
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="snapshot_as_of">As of</Label>
                <Input
                  id="snapshot_as_of"
                  name="as_of"
                  type="date"
                  defaultValue={defaultAsOf}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending} loading={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
