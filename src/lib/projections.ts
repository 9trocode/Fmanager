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

/**
 * Project net worth forward.
 *
 * The non-grant principal grows at the user's blended annual return; monthly
 * contributions land in that same bucket. Grants are re-evaluated at each
 * month using vesting curves, exit-timing assumptions, and tax rates from
 * each grant's own data.
 */
export function projectNetWorth(
  startNonGrantInBase: number,
  grants: ProjectionGrant[],
  fxToBase: Record<string, number>,
  inputs: ProjectionInputs,
): ProjectionPoint[] {
  const r = inputs.annualReturnPct / 100 / 12;
  const c = inputs.monthlyContribution;
  const N = Math.max(0, Math.floor(inputs.horizonMonths));

  const points: ProjectionPoint[] = [];

  for (let m = 0; m <= N; m++) {
    const principal =
      r === 0
        ? startNonGrantInBase + c * m
        : startNonGrantInBase * Math.pow(1 + r, m) +
          c * ((Math.pow(1 + r, m) - 1) / r);

    const grantsByScenario: Record<Scenario, number> = {
      floor: 0,
      expected: 0,
      liquid: 0,
    };
    for (const g of grants) {
      const fx = fxToBase[g.currency] ?? 1;
      grantsByScenario.floor +=
        equityValueForScenario(g, "floor", { monthOffset: m }) * fx;
      grantsByScenario.liquid +=
        equityValueForScenario(g, "liquid", { monthOffset: m }) * fx;
      grantsByScenario.expected +=
        equityValueForScenario(g, "expected", { monthOffset: m }) * fx;
    }

    points.push({
      month: m,
      principal,
      floor: principal + grantsByScenario.floor,
      liquid: principal + grantsByScenario.liquid,
      expected: principal + grantsByScenario.expected,
    });
  }
  return points;
}
