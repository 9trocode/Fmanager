"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TransactionAccountOption } from "@/components/app/transaction-form-fields";

const ALL = "__all__";

export function TransactionsFilters({
  accounts,
  categories,
  current,
}: {
  accounts: TransactionAccountOption[];
  categories: string[];
  current: {
    accountId?: number;
    category?: string;
    kind?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === ALL) params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/transactions?${qs}` : "/transactions");
    });
  }

  const hasFilters =
    current.accountId != null ||
    !!current.category ||
    !!current.kind ||
    !!current.dateFrom ||
    !!current.dateTo;

  return (
    <div className="grid gap-3 md:grid-cols-5 items-end">
      <div className="space-y-1.5">
        <Label htmlFor="filter-account">Account</Label>
        <Select
          value={current.accountId != null ? String(current.accountId) : ALL}
          onValueChange={(v) => update({ account: v === ALL ? undefined : v })}
        >
          <SelectTrigger id="filter-account">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-kind">Kind</Label>
        <Select
          value={current.kind ?? ALL}
          onValueChange={(v) => update({ kind: v === ALL ? undefined : v })}
        >
          <SelectTrigger id="filter-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-category">Category</Label>
        <Select
          value={current.category ?? ALL}
          onValueChange={(v) =>
            update({ category: v === ALL ? undefined : v })
          }
        >
          <SelectTrigger id="filter-category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-from">From</Label>
        <Input
          id="filter-from"
          type="date"
          defaultValue={current.dateFrom ?? ""}
          onChange={(e) => update({ from: e.target.value || undefined })}
        />
      </div>

      <div className="space-y-1.5 flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="filter-to">To</Label>
          <Input
            id="filter-to"
            type="date"
            defaultValue={current.dateTo ?? ""}
            onChange={(e) => update({ to: e.target.value || undefined })}
          />
        </div>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            disabled={pending}
            onClick={() =>
              update({
                account: undefined,
                kind: undefined,
                category: undefined,
                from: undefined,
                to: undefined,
              })
            }
            title="Clear filters"
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
