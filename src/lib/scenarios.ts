export const SCENARIOS = ["floor", "expected", "liquid"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_LABEL: Record<Scenario, string> = {
  floor: "Floor",
  expected: "Expected",
  liquid: "Liquid Today",
};

export const SCENARIO_DESCRIPTION: Record<Scenario, string> = {
  floor: "Equity worth $0. The honest baseline you can plan against.",
  expected: "Equity at expected exit price (post-tax if set). Aspirational, not bankable.",
  liquid: "Equity at current 409A / FMV. Paper, not cash.",
};

export type GrantLike = {
  totalShares: number;
  vestedShares: number;
  strikePrice: number | null;
  fmvPerShare: number | null;
  exitPricePerShare: number | null;
  vestingStartDate?: string | null;
  vestingMonths?: number | null;
  cliffMonths?: number | null;
  expectedExitMonths?: number | null;
  taxRatePct?: number | null;
};

export type ScenarioContext = {
  /** Months from "today" — 0 = today, 12 = one year out. Used by projections. */
  monthOffset?: number;
};

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    (to.getDate() < from.getDate() ? -1 : 0)
  );
}

/**
 * Vested shares at a given month offset from today.
 * - At monthOffset = 0: trust the user's stored vestedShares (manual override).
 * - For future offsets: derive from vesting curve if vestingStartDate is set;
 *   otherwise stay at the stored vestedShares (no curve known).
 */
export function vestedSharesAt(grant: GrantLike, monthOffset: number): number {
  if (monthOffset <= 0 || !grant.vestingStartDate) return grant.vestedShares;
  const start = new Date(grant.vestingStartDate);
  if (Number.isNaN(start.getTime())) return grant.vestedShares;

  const target = new Date();
  target.setMonth(target.getMonth() + monthOffset);
  const elapsed = monthsBetween(start, target);

  const cliff = grant.cliffMonths ?? 12;
  const total = grant.vestingMonths ?? 48;

  if (elapsed < cliff) return Math.max(grant.vestedShares, 0);
  const fraction = Math.min(1, total > 0 ? elapsed / total : 1);
  const curveVested = grant.totalShares * fraction;
  // Don't go backward from the stored manual value; the curve is for future projection.
  return Math.max(grant.vestedShares, curveVested);
}

function applyTax(value: number, taxRatePct: number | null | undefined): number {
  if (taxRatePct == null || value <= 0) return value;
  return value * (1 - taxRatePct / 100);
}

export function equityValueForScenario(
  grant: GrantLike,
  scenario: Scenario,
  ctx: ScenarioContext = {},
): number {
  if (scenario === "floor") return 0;
  const monthOffset = ctx.monthOffset ?? 0;

  // Expected with explicit exit timing: 0 until exit month, then everything vests
  // and is liquidated at exit price (post-tax).
  if (scenario === "expected" && grant.expectedExitMonths != null) {
    if (monthOffset < grant.expectedExitMonths) return 0;
    const price = grant.exitPricePerShare ?? grant.fmvPerShare ?? 0;
    const cost = grant.strikePrice ? grant.totalShares * grant.strikePrice : 0;
    const gross = grant.totalShares * price - cost;
    return applyTax(Math.max(0, gross), grant.taxRatePct ?? null);
  }

  // Otherwise: vested-shares × scenario-price - exercise cost, post-tax.
  const vested = vestedSharesAt(grant, monthOffset);
  const price =
    scenario === "expected"
      ? (grant.exitPricePerShare ?? grant.fmvPerShare ?? 0)
      : (grant.fmvPerShare ?? 0);
  const cost = grant.strikePrice ? vested * grant.strikePrice : 0;
  const gross = vested * price - cost;
  return applyTax(Math.max(0, gross), grant.taxRatePct ?? null);
}
