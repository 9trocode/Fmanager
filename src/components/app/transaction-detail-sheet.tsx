"use client";

import { useState } from "react";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Calendar,
  Hash,
  Pencil,
  Repeat,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/alert-dialog";
import { EditTransactionDialog } from "@/components/app/edit-transaction-dialog";
import type { TransactionAccountOption } from "@/components/app/transaction-form-fields";
import { deleteTransaction } from "@/lib/actions/transactions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionKind } from "@/lib/db/schema";

export type TransactionDetailRow = {
  id: number;
  accountId: number;
  destAccountId: number | null;
  kind: TransactionKind;
  amount: number;
  currency: string;
  category: string | null;
  occurredAt: string;
  notes: string | null;
  flowId?: number | null;
};

const KIND_LABEL: Record<TransactionKind, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
};

/**
 * Right-side details panel for a single transaction. Opens on click
 * from the list (replacing the previous "click → edit-dialog" jump).
 * Read-first surface: shows the full record + provenance (e.g.
 * auto-accrued from a recurring flow), with Edit and Delete affordances
 * that open the existing dialogs/confirms inside the sheet.
 */
export function TransactionDetailSheet({
  open,
  onOpenChange,
  transaction,
  accounts,
  readOnly,
  contextAccountId,
  flowsById,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionDetailRow;
  accounts: TransactionAccountOption[];
  readOnly: boolean;
  /** When opened from an account detail page, sign transfers relative to it. */
  contextAccountId?: number;
  flowsById?: Map<number, { name: string; kind: "income" | "expense" }>;
}) {
  const fromFlow =
    transaction.flowId != null ? flowsById?.get(transaction.flowId) : null;
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sourceAcc = accounts.find((a) => a.id === transaction.accountId);
  const destAcc =
    transaction.destAccountId != null
      ? accounts.find((a) => a.id === transaction.destAccountId)
      : null;

  // Sign + color, mirroring the row pattern from the list.
  let amountSigned = formatMoney(transaction.amount, transaction.currency);
  let amountTone = "text-foreground";
  if (transaction.kind === "income") {
    amountSigned = "+" + amountSigned;
    amountTone = "text-emerald-400";
  } else if (transaction.kind === "expense") {
    amountSigned = "−" + amountSigned;
    amountTone = "text-destructive";
  } else if (transaction.kind === "transfer" && contextAccountId != null) {
    if (transaction.accountId === contextAccountId) {
      amountSigned = "−" + formatMoney(transaction.amount, transaction.currency);
      amountTone = "text-destructive";
    } else if (transaction.destAccountId === contextAccountId) {
      amountSigned = "+" + formatMoney(transaction.amount, transaction.currency);
      amountTone = "text-emerald-400";
    }
  }

  const KindIcon =
    transaction.kind === "income"
      ? ArrowUpRight
      : transaction.kind === "expense"
        ? ArrowDownRight
        : ArrowLeftRight;
  const kindIconBg =
    transaction.kind === "income"
      ? "bg-emerald-500/15 text-emerald-300"
      : transaction.kind === "expense"
        ? "bg-destructive/15 text-destructive"
        : "bg-secondary text-muted-foreground";

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", String(transaction.id));
    deleteTransaction(fd);
    setConfirmDelete(false);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="p-0 w-full sm:max-w-[480px] flex flex-col gap-0"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "size-10 rounded-md grid place-items-center shrink-0",
                kindIconBg,
              )}
            >
              <KindIcon className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base flex items-center gap-2">
                {KIND_LABEL[transaction.kind]}
                {transaction.flowId != null ? (
                  <Badge
                    variant="secondary"
                    className="text-[10px] font-mono inline-flex items-center gap-1"
                  >
                    <Repeat className="size-3" />
                    flow
                  </Badge>
                ) : null}
              </SheetTitle>
              <SheetDescription className="text-xs">
                Posted {transaction.occurredAt}
                {fromFlow
                  ? ` · auto-posted from "${fromFlow.name}" (recurring schedule)`
                  : transaction.flowId != null
                    ? " · auto-posted from a recurring flow"
                    : ""}
              </SheetDescription>
            </div>
          </div>
          <div className={cn("font-mono tabular-nums text-2xl mt-3", amountTone)}>
            {amountSigned}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <DetailRow
            icon={Wallet}
            label={transaction.kind === "transfer" ? "From → To" : "Account"}
            value={
              transaction.kind === "transfer" && destAcc
                ? `${sourceAcc?.name ?? "?"} → ${destAcc.name}`
                : (sourceAcc?.name ?? "?")
            }
            sub={transaction.currency}
          />

          <DetailRow
            icon={Calendar}
            label="Date"
            value={transaction.occurredAt}
          />

          {transaction.category ? (
            <DetailRow
              icon={Hash}
              label="Category"
              value={transaction.category}
            />
          ) : null}

          {transaction.notes ? (
            <div className="space-y-1.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                Notes
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap rounded-md bg-secondary/40 px-3 py-2">
                {transaction.notes}
              </p>
            </div>
          ) : null}

          <div className="text-[10px] font-mono text-muted-foreground/60 pt-2">
            id #{transaction.id}
            {transaction.flowId != null
              ? ` · flow #${transaction.flowId}`
              : ""}
          </div>
        </div>

        {!readOnly ? (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Edit
            </Button>
          </div>
        ) : null}
      </SheetContent>

      <EditTransactionDialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          // Close the sheet too once the user finishes editing — the
          // tx data underneath the sheet may have moved (changed
          // account, etc.) and the parent will re-render with fresh
          // data on the next render.
          if (!v) onOpenChange(false);
        }}
        accounts={accounts}
        transaction={{
          id: transaction.id,
          accountId: transaction.accountId,
          destAccountId: transaction.destAccountId,
          kind: transaction.kind,
          amount: transaction.amount,
          currency: transaction.currency,
          category: transaction.category,
          occurredAt: transaction.occurredAt,
          notes: transaction.notes,
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanent. The effective balance for the account(s) will update
              immediately.
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
    </Sheet>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="size-7 rounded-md grid place-items-center shrink-0 bg-secondary/60 text-muted-foreground mt-0.5">
        <Icon className="size-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
          {label}
        </div>
        <div className="text-sm">{value}</div>
        {sub ? (
          <div className="text-[11px] text-muted-foreground capitalize">
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
}
