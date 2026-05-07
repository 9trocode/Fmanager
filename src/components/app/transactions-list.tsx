"use client";

import { useState, useTransition } from "react";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditTransactionDialog } from "@/components/app/edit-transaction-dialog";
import type { TransactionAccountOption } from "@/components/app/transaction-form-fields";
import { deleteTransaction } from "@/lib/actions/transactions";
import { formatMoney } from "@/lib/format";
import type { TransactionKind } from "@/lib/db/schema";
import { useRole } from "@/components/app/role-context";

export type TransactionRow = {
  id: number;
  accountId: number;
  destAccountId: number | null;
  kind: TransactionKind;
  amount: number;
  currency: string;
  category: string | null;
  occurredAt: string;
  notes: string | null;
  /**
   * If non-null, this transaction was auto-posted from a recurring flow
   * (either at flow-create time or by the cadence-based accruer).
   * Surface this so consumers can distinguish "truly one-off" from
   * "flow accrual" — e.g. the cash-flow page hides flow-linked
   * transactions from its "Recent one-time" section.
   */
  flowId?: number | null;
};

function KindIcon({ kind }: { kind: TransactionKind }) {
  if (kind === "income") {
    return (
      <div className="size-8 rounded-md grid place-items-center shrink-0 bg-emerald-500/15 text-emerald-300">
        <ArrowUpRight className="size-4" />
      </div>
    );
  }
  if (kind === "expense") {
    return (
      <div className="size-8 rounded-md grid place-items-center shrink-0 bg-destructive/15 text-destructive">
        <ArrowDownRight className="size-4" />
      </div>
    );
  }
  return (
    <div className="size-8 rounded-md grid place-items-center shrink-0 bg-secondary text-muted-foreground">
      <ArrowLeftRight className="size-4" />
    </div>
  );
}

function formatSigned(t: TransactionRow): string {
  if (t.kind === "income") return "+" + formatMoney(t.amount, t.currency);
  if (t.kind === "expense") return "−" + formatMoney(t.amount, t.currency);
  return formatMoney(t.amount, t.currency);
}

export function TransactionItem({
  transaction,
  accounts,
  contextAccountId,
}: {
  transaction: TransactionRow;
  accounts: TransactionAccountOption[];
  /** When rendered on an account detail page, sign transfers relative to this account. */
  contextAccountId?: number;
}) {
  const role = useRole();
  const readOnly = role === "viewer";
  const [editOpen, setEditOpen] = useState(false);
  const [, startTransition] = useTransition();

  const sourceAcc = accounts.find((a) => a.id === transaction.accountId);
  const destAcc =
    transaction.destAccountId != null
      ? accounts.find((a) => a.id === transaction.destAccountId)
      : null;

  let amountDisplay = formatSigned(transaction);
  let amountClass = "";
  if (transaction.kind === "income") amountClass = "text-emerald-300";
  if (transaction.kind === "expense") amountClass = "text-destructive";

  if (transaction.kind === "transfer" && contextAccountId != null) {
    if (transaction.accountId === contextAccountId) {
      amountDisplay = "−" + formatMoney(transaction.amount, transaction.currency);
      amountClass = "text-destructive";
    } else if (transaction.destAccountId === contextAccountId) {
      amountDisplay = "+" + formatMoney(transaction.amount, transaction.currency);
      amountClass = "text-emerald-300";
    }
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", String(transaction.id));
    startTransition(async () => {
      await deleteTransaction(fd);
    });
  }

  const accountLabel =
    transaction.kind === "transfer" && destAcc
      ? `${sourceAcc?.name ?? "?"} → ${destAcc.name}`
      : (sourceAcc?.name ?? "?");

  const clickable = !readOnly;

  return (
    <div
      className={
        "flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border " +
        (clickable ? "cursor-pointer hover:bg-secondary/40 " : "") +
        "transition-colors"
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={() => {
        if (clickable) setEditOpen(true);
      }}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setEditOpen(true);
        }
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <KindIcon kind={transaction.kind} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{accountLabel}</span>
            {transaction.category ? (
              <Badge variant="secondary" className="text-[10px]">
                {transaction.category}
              </Badge>
            ) : null}
            <span className="text-[10px] font-mono text-muted-foreground">
              {transaction.occurredAt}
            </span>
          </div>
          {transaction.notes ? (
            <div className="text-xs text-muted-foreground truncate">
              {transaction.notes}
            </div>
          ) : null}
        </div>
      </div>
      <div
        className="flex items-center gap-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={"font-mono tabular-nums text-sm " + amountClass}
        >
          {amountDisplay}
        </div>
        {readOnly ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
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
                    Permanent. The effective balance for the account(s) will
                    update immediately.
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
        )}
      </div>

      <EditTransactionDialog
        open={editOpen}
        onOpenChange={setEditOpen}
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
    </div>
  );
}
