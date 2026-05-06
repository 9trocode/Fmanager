"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Strip everything that isn't a digit, dot, or leading minus. */
function strip(s: string): string {
  return s.replace(/[^0-9.\-]/g, "");
}

function toNumber(s: string): number | null {
  if (s === "" || s === "-" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Money / numeric input that formats with thousands grouping on blur, lets
 * the user type freely on focus, and submits the raw numeric value via a
 * hidden input. Drop-in for `<Input type="number">` on currency fields.
 *
 * The currency is intentionally NOT rendered inside the field — every form
 * that uses this also has a currency Select right next to it.
 */
export function MoneyInput({
  name,
  id,
  defaultValue,
  required,
  placeholder,
  className,
  autoFocus,
  allowNegative = false,
  disabled,
}: {
  name: string;
  id?: string;
  defaultValue?: number | string | null;
  required?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  allowNegative?: boolean;
  disabled?: boolean;
}) {
  const generatedId = useId();
  const [raw, setRaw] = useState<string>(() => {
    if (defaultValue == null || defaultValue === "") return "";
    return strip(String(defaultValue));
  });
  const [focused, setFocused] = useState(false);

  const numeric = toNumber(raw);
  const formatted = numeric != null ? FMT.format(numeric) : "";
  const display = focused ? raw : formatted;

  return (
    <>
      <input type="hidden" name={name} value={numeric ?? ""} />
      <Input
        id={id ?? generatedId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={display}
        placeholder={placeholder ?? "0"}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        className={cn("font-mono tabular-nums", className)}
        onChange={(e) => {
          let next = strip(e.target.value);
          if (!allowNegative) next = next.replace(/-/g, "");
          // collapse multiple dots (keep first)
          const firstDot = next.indexOf(".");
          if (firstDot !== -1) {
            next =
              next.slice(0, firstDot + 1) +
              next.slice(firstDot + 1).replace(/\./g, "");
          }
          setRaw(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </>
  );
}
