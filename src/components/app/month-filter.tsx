"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, RotateCcw } from "lucide-react";
import { useMemo, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Global month-scoped page filter.
 *
 * Backbone of the "month-to-month" UX. Mounted in the sidebar so the
 * choice carries across navigations — pick October 2025 on Home, click
 * Budgets, and Budgets renders for October 2025 too.
 *
 * Persistence strategy:
 *   - URL param `?m=YYYY-MM` — explicit on the active page so it's
 *     shareable, bookmarkable, and survives browser back/forward.
 *   - Cookie `ff_month=YYYY-MM` — written on every selection. Server
 *     pages read it as the fallback when no `?m` is present, which is
 *     how a sidebar nav click between pages preserves the filter
 *     without rewriting every Link to append the query.
 *
 * The dropdown shows the current month, the previous 23 (so a full
 * year ago is always one click), then a sentinel "Reset to current
 * month" that clears the cookie + URL param.
 */

const COOKIE = "ff_month";
const MONTHS_BACK = 24;
const MONTHS_FORWARD = 12;

export function MonthFilter({
  variant = "default",
}: {
  /** Render compactly when mounted inside the sidebar footer. */
  variant?: "default" | "compact";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const currentKey = useMemo(() => monthKey(new Date()), []);
  // Source of truth precedence: URL param > cookie > current month.
  const fromUrl = params.get("m");
  const cookieKey = readCookie(COOKIE);
  const selected = fromUrl ?? cookieKey ?? currentKey;

  const options = useMemo(() => {
    const out: Array<{ value: string; label: string; future?: boolean }> = [];
    const now = new Date();
    // Future months first (most distant at top), so "plan ahead" is one
    // glance away. Then this month, then past months back to MONTHS_BACK.
    for (let i = MONTHS_FORWARD; i >= 1; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const value = monthKey(d);
      const label = d.toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
      out.push({ value, label: `${label} (forecast)`, future: true });
    }
    for (let i = 0; i < MONTHS_BACK; i++) {
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

  function applyMonth(value: string) {
    const reset = value === currentKey;
    if (reset) {
      writeCookie(COOKIE, "", 0); // clear
    } else {
      writeCookie(COOKIE, value, 60 * 60 * 24 * 365); // 1 year
    }
    const next = new URLSearchParams(params.toString());
    if (reset) next.delete("m");
    else next.set("m", value);
    const qs = next.toString();
    const target = qs ? `${pathname}?${qs}` : pathname;
    startTransition(() => {
      router.replace(target, { scroll: false });
      router.refresh();
    });
  }

  const activeLabel =
    options.find((o) => o.value === selected)?.label ?? selected;
  const isOverridden = selected !== currentKey;

  return (
    <Select
      value={selected}
      onValueChange={applyMonth}
      disabled={pending}
    >
      <SelectTrigger
        size="sm"
        className={
          "gap-2 font-mono text-xs " +
          (variant === "compact"
            ? "w-full justify-start"
            : "w-auto min-w-[180px]")
        }
      >
        <Calendar className="size-3.5 shrink-0 text-muted-foreground" />
        <SelectValue>
          <span className="truncate">{activeLabel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align={variant === "compact" ? "start" : "end"}
        className="max-h-72 overflow-y-auto"
      >
        {isOverridden ? (
          <>
            <SelectItem
              value={currentKey}
              className="text-xs text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw className="size-3" />
                Reset to this month
              </span>
            </SelectItem>
            <SelectSeparator />
          </>
        ) : null}
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

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`));
  if (!match) return null;
  const v = decodeURIComponent(match.slice(name.length + 1));
  return v || null;
}

function writeCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") return;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `path=/`,
    `max-age=${maxAge}`,
    `SameSite=Lax`,
  ];
  document.cookie = parts.join("; ");
}
