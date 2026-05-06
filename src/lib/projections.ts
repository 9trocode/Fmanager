import type { Scenario } from "@/lib/scenarios";

export type ProjectionInputs = {
  monthlyContribution: number;
  annualReturnPct: number;
  horizonMonths: number;
};

export type ProjectionPoint = {
  month: number;
  principal: number;
  floor: number;
  liquid: number;
  expected: number;
};

/**
 * Project net worth forward.
 *
 * Simplification: a single blended annual return is applied to the non-grant
 * portion of net worth (the part that varies between scenarios because of
 * equity is treated as static). Contributions are added monthly into the
 * growing principal. Equity grants stay constant at their per-scenario value.
 */
export function projectNetWorth(
  startTotals: Record<Scenario, number>,
  startGrants: Record<Scenario, number>,
  inputs: ProjectionInputs,
): ProjectionPoint[] {
  const r = inputs.annualReturnPct / 100 / 12;
  const c = inputs.monthlyContribution;
  const N = Math.max(0, Math.floor(inputs.horizonMonths));
  const principal0 = startTotals.floor - startGrants.floor; // non-grant base

  const points: ProjectionPoint[] = [];
  for (let m = 0; m <= N; m++) {
    const grown =
      r === 0
        ? principal0 + c * m
        : principal0 * Math.pow(1 + r, m) + c * ((Math.pow(1 + r, m) - 1) / r);

    points.push({
      month: m,
      principal: grown,
      floor: grown + startGrants.floor,
      liquid: grown + startGrants.liquid,
      expected: grown + startGrants.expected,
    });
  }
  return points;
}
