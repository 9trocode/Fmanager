import {
  equityValueForScenario,
  type GrantLike,
  type Scenario,
} from "@/lib/scenarios";

/**
 * One mid-stream change to a scenario. The model is "scrub forward
 * monthly; at `atMonth`, apply this change for the rest of the run".
 *
 *  - raise:          your monthly contribution becomes `newMonthly` at
 *                    month M (e.g. "salary bump in 6 months → +200k/mo").
 *  - expense_shock:  expenses go up, contribution goes down — same shape
 *                    as raise but signed negative for clarity in UI;
 *                    operationally identical to a raise with newMonthly < current.
 *  - lump_sum:       a one-time injection (or withdrawal if negative) at
 *                    month M (bonus, tax refund, surprise medical bill).
 */
export type ScenarioEvent =
  | {
      kind: "raise";
      atMonth: number;
      newMonthly: number;
      label?: string;
    }
  | {
      kind: "expense_shock";
      atMonth: number;
      newMonthly: number;
      label?: string;
    }
  | {
      kind: "lump_sum";
      atMonth: number;
      amount: number;
      label?: string;
    };

export type ProjectionInputs = {
  monthlyContribution: number;
  annualReturnPct: number;
  horizonMonths: number;
  events?: ScenarioEvent[];
};

export type ProjectionGrant = GrantLike & { currency: string };

export type ProjectionPoint = {
  month: number;
  principal: number;
  floor: number;
  liquid: number;
  expected: number;
};

export type NamedScenario = {
  id: string;
  name: string;
  inputs: ProjectionInputs;
};

/** Single shared month entry across multiple scenarios, keyed `${id}_${view}`. */
export type MultiScenarioPoint = {
  month: number;
} & Record<string, number>;

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
  const horizonRaw = finite(inputs.horizonMonths);
  const N = Math.max(0, Math.floor(horizonRaw));

  // Pre-sort events so the event-folding loop below can short-circuit.
  const events = (inputs.events ?? [])
    .filter((e) => Number.isFinite(e.atMonth) && e.atMonth >= 0)
    .slice()
    .sort((a, b) => a.atMonth - b.atMonth);

  const points: ProjectionPoint[] = [];
  // Step-by-step compounding rather than the closed-form annuity formula
  // because events let the contribution change mid-run. The closed-form
  // shape doesn't compose cleanly across step changes; an iterative loop
  // does (and is still O(N) — N is months, not years, so 600 ops max).
  let principal = start;
  let monthly = finite(inputs.monthlyContribution);
  let eventCursor = 0;

  for (let m = 0; m <= N; m++) {
    while (eventCursor < events.length && events[eventCursor].atMonth === m) {
      const e = events[eventCursor];
      if (e.kind === "raise" || e.kind === "expense_shock") {
        monthly = finite(e.newMonthly);
      } else if (e.kind === "lump_sum") {
        principal += finite(e.amount);
      }
      eventCursor += 1;
    }

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
      principal: finite(principal),
      floor: finite(principal + grantsByScenario.floor),
      liquid: finite(principal + grantsByScenario.liquid),
      expected: finite(principal + grantsByScenario.expected),
    });

    // Advance to next month: principal compounds, contribution lands.
    // Event applications above happen at the START of month m, so the
    // bumped `monthly` and any lump_sum effect ride this step.
    if (m < N) {
      principal = principal * (1 + r) + monthly;
    }
  }
  return points;
}

/**
 * Run multiple named scenarios over the same starting state and zip the
 * resulting series into one row-per-month shape suitable for a single
 * recharts <LineChart> with N series.
 *
 * `view` selects which sub-scenario (floor / liquid / expected) to plot
 * per scenario. With multiple scenarios, plotting all three sub-scenarios
 * each is visual chaos — picking one keeps the comparison readable.
 */
export function projectMultiScenario(
  startNonGrantInBase: number,
  grants: ProjectionGrant[],
  fxToBase: Record<string, number>,
  scenarios: NamedScenario[],
  view: Scenario = "floor",
): {
  points: MultiScenarioPoint[];
  byScenario: Record<string, ProjectionPoint[]>;
  maxMonth: number;
} {
  const byScenario: Record<string, ProjectionPoint[]> = {};
  let maxMonth = 0;
  for (const s of scenarios) {
    const series = projectNetWorth(startNonGrantInBase, grants, fxToBase, s.inputs);
    byScenario[s.id] = series;
    if (series.length - 1 > maxMonth) maxMonth = series.length - 1;
  }

  const points: MultiScenarioPoint[] = [];
  for (let m = 0; m <= maxMonth; m++) {
    const row: MultiScenarioPoint = { month: m };
    for (const s of scenarios) {
      const series = byScenario[s.id];
      const pt = series[m];
      // After a scenario's horizon, its line just stops — leaving the
      // value undefined keeps recharts from drawing a flat tail.
      if (pt) row[s.id] = pt[view];
    }
    points.push(row);
  }
  return { points, byScenario, maxMonth };
}

/**
 * First month a scenario's value (in `view`) crosses `target`. Used to
 * annotate "you'd hit your goal at month X" per scenario.
 */
export function firstMonthCrossing(
  series: ProjectionPoint[],
  target: number,
  view: Scenario = "floor",
): number | null {
  if (!Number.isFinite(target)) return null;
  for (const p of series) {
    if (p[view] >= target) return p.month;
  }
  return null;
}
