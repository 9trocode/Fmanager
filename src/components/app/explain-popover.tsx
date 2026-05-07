"use client";

import { Info } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Tiny "how is this number computed?" affordance.
 *
 * Pages that surface aggregate values (net worth, free cash, runway,
 * budget summaries) can drop one of these next to the headline number.
 * The user clicks the info icon and sees a structured breakdown:
 *
 *   - title       — the number itself, in display form ("NGN 57,248")
 *   - subtitle    — one-line plain-English description ("Floor net worth")
 *   - lines       — components that fed in: label + value, optionally
 *                   with a hint or a sub-pill
 *   - formula     — short formula or arithmetic, mono-spaced
 *   - footer      — optional caveat or link
 *
 * Build the lines server-side where possible (the math is already
 * happening there for the headline number).
 */

export type ExplainLine = {
  label: string;
  value: string;
  /** Optional secondary text shown muted under the label. */
  hint?: string;
  /** Optional emphasis — e.g. for the "= total" line at the bottom. */
  emphasis?: "default" | "muted" | "total";
};

export function ExplainPopover({
  title,
  subtitle,
  lines,
  formula,
  footer,
  className,
  triggerLabel = "Show breakdown",
}: {
  title: string;
  subtitle?: string;
  lines: ExplainLine[];
  formula?: string;
  footer?: React.ReactNode;
  className?: string;
  triggerLabel?: string;
}) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          className={cn(
            "inline-flex items-center justify-center size-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors cursor-pointer",
            className,
          )}
        >
          <Info className="size-3.5" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-80 max-w-[92vw] rounded-xl border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/5 p-4 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
        >
          <div className="space-y-3">
            <div className="space-y-0.5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                How this is calculated
              </div>
              <div className="text-base font-semibold tracking-tight font-mono tabular-nums">
                {title}
              </div>
              {subtitle ? (
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {subtitle}
                </div>
              ) : null}
            </div>

            {lines.length > 0 ? (
              <div className="border-t border-border pt-3 space-y-1.5">
                {lines.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "truncate",
                          l.emphasis === "muted" && "text-muted-foreground",
                          l.emphasis === "total" && "font-medium",
                        )}
                      >
                        {l.label}
                      </div>
                      {l.hint ? (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {l.hint}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        "font-mono tabular-nums shrink-0",
                        l.emphasis === "muted" && "text-muted-foreground",
                        l.emphasis === "total" &&
                          "font-semibold text-foreground border-t border-border pt-1.5 mt-0.5",
                      )}
                    >
                      {l.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {formula ? (
              <div className="border-t border-border pt-3 text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {formula}
              </div>
            ) : null}

            {footer ? (
              <div className="border-t border-border pt-3 text-[11px] text-muted-foreground leading-relaxed">
                {footer}
              </div>
            ) : null}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
