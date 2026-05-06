export const SCENARIOS = ["floor", "expected", "liquid"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_LABEL: Record<Scenario, string> = {
  floor: "Floor",
  expected: "Expected",
  liquid: "Liquid Today",
};

export const SCENARIO_DESCRIPTION: Record<Scenario, string> = {
  floor: "Equity worth $0. The honest baseline you can plan against.",
  expected: "Equity at expected exit price. Aspirational, not bankable.",
  liquid: "Equity at current 409A / FMV. Paper, not cash.",
};

export function equityValueForScenario(
  grant: {
    vestedShares: number;
    strikePrice: number | null;
    fmvPerShare: number | null;
    exitPricePerShare: number | null;
  },
  scenario: Scenario,
): number {
  if (scenario === "floor") return 0;
  const price =
    scenario === "expected"
      ? (grant.exitPricePerShare ?? grant.fmvPerShare ?? 0)
      : (grant.fmvPerShare ?? 0);
  const gross = grant.vestedShares * price;
  const cost = grant.strikePrice ? grant.vestedShares * grant.strikePrice : 0;
  return Math.max(0, gross - cost);
}
