"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  TransactionFields,
  type TransactionAccountOption,
  type TransactionDefaults,
} from "@/components/app/transaction-form-fields";
import { createTransaction } from "@/lib/actions/transactions";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import type { TransactionKind } from "@/lib/db/schema";

export type ParsedSuggestion = {
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  occurredAt: string | null;
  suggestedCategory: string | null;
  notes: string | null;
  kind?: "expense" | "income" | null;
  confidence: "low" | "medium" | "high";
};

function isSupportedCurrency(c: string | null | undefined): c is string {
  if (!c) return false;
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

function isValidIsoDate(s: string | null | undefined): s is string {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function buildNotes(parsed: ParsedSuggestion): string {
  const parts: string[] = [];
  if (parsed.vendor) parts.push(parsed.vendor);
  if (parsed.notes) parts.push(parsed.notes);
  return parts.join(" — ");
}

export function QuickAddPreview({
  parsed,
  accounts,
  onSubmitted,
  defaultKind = "expense",
}: {
  parsed: ParsedSuggestion;
  accounts: TransactionAccountOption[];
  onSubmitted: () => void;
  defaultKind?: TransactionKind;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initialKind: TransactionKind = parsed.kind ?? defaultKind;

  const defaults: TransactionDefaults = useMemo(() => {
    return {
      kind: initialKind,
      amount: parsed.amount ?? undefined,
      currency: isSupportedCurrency(parsed.currency)
        ? parsed.currency
        : undefined,
      category: parsed.suggestedCategory,
      occurredAt: isValidIsoDate(parsed.occurredAt)
        ? parsed.occurredAt
        : undefined,
      notes: buildNotes(parsed) || null,
    };
  }, [initialKind, parsed]);

  const confidenceLabel =
    parsed.confidence === "high"
      ? null
      : parsed.confidence === "medium"
        ? "Medium confidence — double-check the fields below."
        : "Low confidence — please verify each field carefully.";

  if (accounts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        You need at least one account to log a transaction. Add one from the
        Accounts page first.
      </div>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          try {
            setError(null);
            await createTransaction(fd);
            onSubmitted();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed.");
          }
        })
      }
      className="space-y-4"
    >
      {confidenceLabel ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
          <Badge variant="outline" className="border-amber-500/40">
            {parsed.confidence}
          </Badge>
          <span>{confidenceLabel}</span>
        </div>
      ) : null}

      <TransactionFields accounts={accounts} defaults={defaults} />

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save transaction"}
        </Button>
      </DialogFooter>
    </form>
  );
}
