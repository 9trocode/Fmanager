"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { useMemo, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Month-scoped page filter.
 *
 * Backbone of the "month-to-month" UX: budgets/spend/cash flow reset
 * each month, and the user can scrub backwards to look at a previous
 * month's snapshot. The filter writes a `?m=YYYY-MM` param that
 * server-rendered pages forward into their aggregation calls.
 *
 * Empty / missing param means "current month" — pages stay current by
 * default. The dropdown shows the current month plus the previous 11
 * months; we don't surface future months because there's no data
 * there yet.
 */
export function MonthFilter({
  paramName = "m",
}: {
  paramName?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const currentKey = useMemo(() => monthKey(new Date()), []);
  const selected = params.get(paramName) ?? currentKey;

  const options = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = monthKey(d);
      const label = d.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
      out.push({
        value,
        label: value === currentKey ? `${label} (this month)` : label,
      });
    }
    return out;
  }, [currentKey]);

  function onChange(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === currentKey) {
      next.delete(paramName);
    } else {
      next.set(paramName, v);
    }
    const qs = next.toString();
    startTransition(() => {
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
      router.refresh();
    });
  }

  const activeLabel =
    options.find((o) => o.value === selected)?.label ?? selected;

  return (
    <Select value={selected} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        size="sm"
        className="w-auto min-w-[180px] gap-2 font-mono text-xs"
      >
        <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
        <SelectValue>{activeLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
