export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "NGN",
  "GBP",
  "CAD",
  "CHF",
  "JPY",
] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export function formatMoney(
  value: number,
  currency: string,
  opts: { compact?: boolean; signed?: boolean } = {},
): string {
  const { compact, signed } = opts;
  const sign = signed && value > 0 ? "+" : "";
  return (
    sign +
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 0,
    }).format(value)
  );
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(fractionDigits)}%`;
}
