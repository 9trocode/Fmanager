import {
  equityValueForScenario,
  type GrantLike,
  type Scenario,
} from "@/lib/scenarios";

export type ProjectionInputs = {
  monthlyContribution: number;
  annualReturnPct: number;
  horizonMonths: number;
};

export type ProjectionGrant = GrantLike & { currency: string };

export type ProjectionPoint = {
  month: number;
  principal: number;
  floor: number;
  liquid: number;
  expected: number;
};

/** Coerce any non-finite number (NaN, Infinity, -Infinity) to a safe fallback. */
function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Project net worth forward.
 *
 * The non-grant principal grows at the user's blended annual return; monthly
 * contributions land in that same bucket. Grants are re-evaluated at each
 * month using vesting curves, exit-timing assumptions, and tax rates from
 * each grant's own data.
 *
 * Every input and intermediate value is clamped to a finite number so that a
 * single bad upstream value (e.g. a flow with NaN amount, an empty input
 * box) never poisons the whole chart with NaNs.
 */
export function projectNetWorth(
  startNonGrantInBase: number,
  grants: ProjectionGrant[],
  fxToBase: Record<string, number>,
  inputs: ProjectionInputs,
): ProjectionPoint[] {
  const start = finite(startNonGrantInBase);
  const annualReturnPct = finite(inputs.annualReturnPct);
  const r = annualReturnPct / 100 / 12;
  const c = finite(inputs.monthlyContribution);
  const horizonRaw = finite(inputs.horizonMonths);
  const N = Math.max(0, Math.floor(horizonRaw));

  const points: ProjectionPoint[] = [];

  for (let m = 0; m <= N; m++) {
    const principal = finite(
      r === 0
        ? start + c * m
        : start * Math.pow(1 + r, m) + c * ((Math.pow(1 + r, m) - 1) / r),
    );

    const grantsByScenario: Record<Scenario, number> = {
      floor: 0,
      expected: 0,
      liquid: 0,
    };
    for (const g of grants) {
      const fx = finite(fxToBase[g.currency], 1);
      grantsByScenario.floor += finite(
        equityValueForScenario(g, "floor", { monthOffset: m }) * fx,
      );
      grantsByScenario.liquid += finite(
        equityValueForScenario(g, "liquid", { monthOffset: m }) * fx,
      );
      grantsByScenario.expected += finite(
        equityValueForScenario(g, "expected", { monthOffset: m }) * fx,
      );
    }

    points.push({
      month: m,
      principal,
      floor: finite(principal + grantsByScenario.floor),
      liquid: finite(principal + grantsByScenario.liquid),
      expected: finite(principal + grantsByScenario.expected),
    });
  }
  return points;
}
