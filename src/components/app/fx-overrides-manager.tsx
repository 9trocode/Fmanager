"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import { setFxOverride, clearFxOverride } from "@/lib/actions/fx";
import { useRole } from "@/components/app/role-context";

type Override = {
  id: number;
  base: string;
  quote: string;
  rate: number;
  fetchedAt: string;
};

export function FxOverridesManager({
  initialOverrides,
}: {
  initialOverrides: Override[];
}) {
  const role = useRole();
  const [overrides, setOverrides] = useState<Override[]>(initialOverrides);
  const [base, setBase] = useState<string>("USD");
  const [quote, setQuote] = useState<string>(
    SUPPORTED_CURRENCIES.find((c) => c !== "USD") ?? "EUR",
  );
  const [rate, setRate] = useState<string>("");
  const [pending, startTransition] = useTransition();

  if (role === "viewer") return null;

  // Show one row per base→quote direction. The inverse direction is
  // auto-managed by setFxOverride, so we hide it here to keep the
  // list clean — clearing either direction wipes both.
  const visible = overrides.filter((o) => o.base < o.quote || true);

  return (
    <div className="space-y-4">
      <form
        className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const r = Number(rate);
          if (!Number.isFinite(r) || r <= 0) {
            toast.error("Rate must be a positive number.");
            return;
          }
          if (base === quote) {
            toast.error("Base and quote must differ.");
            return;
          }
          startTransition(async () => {
            try {
              const res = await setFxOverride({ base, quote, rate: r });
              toast.success(
                `Override saved: 1 ${res.base} = ${res.rate} ${res.quote}`,
              );
              setOverrides((prev) => {
                // Replace any existing pair (both directions) with the new entry.
                const filtered = prev.filter(
                  (o) =>
                    !(o.base === base && o.quote === quote) &&
                    !(o.base === quote && o.quote === base),
                );
                return [
                  ...filtered,
                  {
                    id: Date.now(),
                    base,
                    quote,
                    rate: r,
                    fetchedAt: res.fetchedAt,
                  },
                  {
                    id: Date.now() + 1,
                    base: quote,
                    quote: base,
                    rate: 1 / r,
                    fetchedAt: res.fetchedAt,
                  },
                ].sort((a, b) =>
                  a.base === b.base
                    ? a.quote.localeCompare(b.quote)
                    : a.base.localeCompare(b.base),
                );
              });
              setRate("");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to save override.",
              );
            }
          });
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="fx_base">From</Label>
          <Select value={base} onValueChange={setBase}>
            <SelectTrigger id="fx_base">
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
          <Label htmlFor="fx_quote">To</Label>
          <Select value={quote} onValueChange={setQuote}>
            <SelectTrigger id="fx_quote">
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
          <Label htmlFor="fx_rate">
            Rate (1 {base} = ? {quote})
          </Label>
          <Input
            id="fx_rate"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            placeholder="e.g. 1650"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </div>

        <Button type="submit" disabled={pending} loading={pending}>
          {pending ? "Saving…" : "Save override"}
        </Button>
      </form>

      {visible.length > 0 ? (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Pair</th>
                <th className="text-right px-3 py-2 font-medium">Rate</th>
                <th className="text-left px-3 py-2 font-medium">Set</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((o) => (
                <tr key={`${o.base}-${o.quote}`} className="border-b last:border-0">
                  <td className="px-3 py-2 font-mono">
                    {o.base} → {o.quote}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {o.rate.toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                    })}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(o.fetchedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            await clearFxOverride({
                              base: o.base,
                              quote: o.quote,
                            });
                            setOverrides((prev) =>
                              prev.filter(
                                (x) =>
                                  !(x.base === o.base && x.quote === o.quote) &&
                                  !(x.base === o.quote && x.quote === o.base),
                              ),
                            );
                            toast.success(
                              `Override cleared for ${o.base} → ${o.quote}`,
                            );
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Failed to clear override.",
                            );
                          }
                        });
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No manual overrides set. Fetched rates from open.er-api.com are
          used everywhere.
        </p>
      )}
    </div>
  );
}
