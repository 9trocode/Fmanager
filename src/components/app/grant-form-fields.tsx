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
import { Separator } from "@/components/ui/separator";
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
  vestingStartDate?: string | null;
  vestingMonths?: number | null;
  cliffMonths?: number | null;
  expectedExitMonths?: number | null;
  taxRatePct?: number | null;
  grantedAt?: string | null;
  vestingNotes?: string | null;
};

export function GrantFields({ defaults }: { defaults?: GrantFieldsValue }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <Label htmlFor="vested_shares">Vested today</Label>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="strike_price">Strike</Label>
          <MoneyInput
            id="strike_price"
            name="strike_price"
            defaultValue={defaults?.strikePrice ?? null}
            placeholder="0.10"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fmv_per_share">FMV (409A)</Label>
          <MoneyInput
            id="fmv_per_share"
            name="fmv_per_share"
            defaultValue={defaults?.fmvPerShare ?? null}
            placeholder="2.50"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exit_price_per_share">Expected exit</Label>
          <MoneyInput
            id="exit_price_per_share"
            name="exit_price_per_share"
            defaultValue={defaults?.exitPricePerShare ?? null}
            placeholder="20.00"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      <Separator className="my-2" />

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium select-none flex items-center justify-between">
          <span>
            Vesting & exit assumptions{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </span>
          <span className="text-[11px] text-muted-foreground group-open:rotate-90 transition-transform">
            ›
          </span>
        </summary>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vesting_start_date">Vesting start</Label>
              <Input
                id="vesting_start_date"
                name="vesting_start_date"
                type="date"
                defaultValue={defaults?.vestingStartDate ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vesting_months">Vest length (mo)</Label>
              <Input
                id="vesting_months"
                name="vesting_months"
                type="number"
                step="1"
                min="1"
                defaultValue={defaults?.vestingMonths ?? 48}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cliff_months">Cliff (mo)</Label>
              <Input
                id="cliff_months"
                name="cliff_months"
                type="number"
                step="1"
                min="0"
                defaultValue={defaults?.cliffMonths ?? 12}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="expected_exit_months">Expected exit (months from today)</Label>
              <Input
                id="expected_exit_months"
                name="expected_exit_months"
                type="number"
                step="1"
                min="0"
                defaultValue={defaults?.expectedExitMonths ?? ""}
                placeholder="36"
              />
              <p className="text-[10px] text-muted-foreground">
                If set, Expected scenario stays at $0 until this month.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax_rate_pct">Tax rate (%)</Label>
              <Input
                id="tax_rate_pct"
                name="tax_rate_pct"
                type="number"
                step="0.5"
                min="0"
                max="100"
                defaultValue={defaults?.taxRatePct ?? ""}
                placeholder="20"
              />
              <p className="text-[10px] text-muted-foreground">
                LTCG ~20%, ordinary ~37%, QSBS 0%.
              </p>
            </div>
          </div>
        </div>
      </details>

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
