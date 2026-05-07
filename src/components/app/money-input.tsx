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
 * Money / numeric input that formats with thousands grouping on blur and
 * lets the user type freely on focus.
 *
 * Two modes:
 *   - Form mode (default): pass `name` (and optional `defaultValue`).
 *     The component renders a hidden input that submits the raw number
 *     so this drops in for `<Input type="number">` inside a form.
 *   - Controlled mode: pass `value` + `onValueChange`. No hidden input;
 *     the parent owns state. Useful for live tools like the projections
 *     explorer where the value drives charts in real time.
 */
export function MoneyInput({
  name,
  id,
  defaultValue,
  value,
  onValueChange,
  required,
  placeholder,
  className,
  autoFocus,
  allowNegative = false,
  disabled,
}: {
  name?: string;
  id?: string;
  defaultValue?: number | string | null;
  /** Controlled value. Pass alongside `onValueChange`. */
  value?: number | null;
  /** Fires with the parsed number (or null if the field is empty). */
  onValueChange?: (n: number | null) => void;
  required?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  allowNegative?: boolean;
  disabled?: boolean;
}) {
  const generatedId = useId();
  const isControlled = value !== undefined;

  // Internal raw text. In controlled mode this only matters while the
  // input is focused (so the user can see exactly what they typed); on
  // blur the formatted version of `value` takes over.
  const [raw, setRaw] = useState<string>(() => {
    const seed = isControlled ? value : defaultValue;
    if (seed == null || seed === "") return "";
    return strip(String(seed));
  });
  const [focused, setFocused] = useState(false);

  // Pick the source of truth for the displayed number.
  // - Controlled + blurred: the parent's `value` (formatted with commas).
  // - Controlled + focused: the user's raw text.
  // - Uncontrolled: always our internal `raw`.
  const numeric = isControlled
    ? focused
      ? toNumber(raw)
      : (value ?? null)
    : toNumber(raw);
  const formatted = numeric != null ? FMT.format(numeric) : "";
  const display = focused ? raw : formatted;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
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
    if (isControlled) onValueChange?.(toNumber(next));
  }

  return (
    <>
      {!isControlled && name ? (
        <input type="hidden" name={name} value={numeric ?? ""} />
      ) : null}
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
        onChange={handleChange}
        onFocus={() => {
          // Seed the raw text from the controlled value when the user
          // starts typing, so editing a 50,000 doesn't lose precision.
          if (isControlled) {
            setRaw(value != null ? String(value) : "");
          }
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
      />
    </>
  );
}
