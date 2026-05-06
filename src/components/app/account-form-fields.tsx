"use client";

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
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/account-types";
import type { AccountType } from "@/lib/db/schema";

export type AccountFieldsValue = {
  name?: string;
  type?: AccountType;
  currency?: string;
  institution?: string | null;
  notes?: string | null;
};

export function AccountFields({
  defaults,
  showOpening,
}: {
  defaults?: AccountFieldsValue;
  showOpening?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={defaults?.name ?? ""}
          placeholder="Mercury USD checking"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <Select name="type" defaultValue={defaults?.type ?? "cash"}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPE_ORDER.map((t) => (
                <SelectItem key={t} value={t}>
                  {ACCOUNT_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Select name="currency" defaultValue={defaults?.currency ?? "USD"}>
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="institution">Institution (optional)</Label>
        <Input
          id="institution"
          name="institution"
          defaultValue={defaults?.institution ?? ""}
          placeholder="Mercury, Wise, Fidelity, …"
        />
      </div>
      {showOpening ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="opening_balance">Opening balance</Label>
            <MoneyInput
              id="opening_balance"
              name="opening_balance"
              defaultValue={0}
              allowNegative
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="as_of">As of</Label>
            <Input
              id="as_of"
              name="as_of"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </div>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Anything that matters about this account."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>
    </div>
  );
}
