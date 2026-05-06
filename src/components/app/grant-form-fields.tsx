"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { GRANT_TYPES, GRANT_TYPE_LABEL, type GrantType } from "@/lib/grant-types";

export type GrantFieldsValue = {
  company?: string;
  grantType?: GrantType;
  totalShares?: number;
  vestedShares?: number;
  strikePrice?: number | null;
  currency?: string;
  fmvPerShare?: number | null;
  exitPricePerShare?: number | null;
  grantedAt?: string | null;
  vestingNotes?: string | null;
};

export function GrantFields({ defaults }: { defaults?: GrantFieldsValue }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            name="company"
            defaultValue={defaults?.company ?? ""}
            placeholder="Acme Inc."
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="grant_type">Grant type</Label>
          <Select name="grant_type" defaultValue={defaults?.grantType ?? "nso"}>
            <SelectTrigger id="grant_type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GRANT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {GRANT_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="total_shares">Total shares</Label>
          <Input
            id="total_shares"
            name="total_shares"
            type="number"
            step="0.0001"
            defaultValue={defaults?.totalShares ?? ""}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vested_shares">Vested shares</Label>
          <Input
            id="vested_shares"
            name="vested_shares"
            type="number"
            step="0.0001"
            defaultValue={defaults?.vestedShares ?? 0}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="strike_price">Strike</Label>
          <Input
            id="strike_price"
            name="strike_price"
            type="number"
            step="0.0001"
            defaultValue={defaults?.strikePrice ?? ""}
            placeholder="0.10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fmv_per_share">FMV (409A)</Label>
          <Input
            id="fmv_per_share"
            name="fmv_per_share"
            type="number"
            step="0.0001"
            defaultValue={defaults?.fmvPerShare ?? ""}
            placeholder="2.50"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exit_price_per_share">Expected exit</Label>
          <Input
            id="exit_price_per_share"
            name="exit_price_per_share"
            type="number"
            step="0.0001"
            defaultValue={defaults?.exitPricePerShare ?? ""}
            placeholder="20.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        <div className="space-y-1.5">
          <Label htmlFor="granted_at">Granted on</Label>
          <Input
            id="granted_at"
            name="granted_at"
            type="date"
            defaultValue={defaults?.grantedAt ?? ""}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="vesting_notes">Vesting notes (optional)</Label>
        <textarea
          id="vesting_notes"
          name="vesting_notes"
          rows={3}
          defaultValue={defaults?.vestingNotes ?? ""}
          placeholder="4-year vest, 1-year cliff. Cliff hits 2026-09-01."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>
    </div>
  );
}
