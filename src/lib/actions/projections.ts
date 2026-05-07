"use server";

import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { buildAdvisorClient } from "@/lib/ai/provider";
import { computeMonthlyCashFlow, computeNetWorth } from "@/lib/aggregation";
import {
  listFlows,
  listSavingsGoals,
  getBaseCurrency,
} from "@/lib/db/queries";
import { computeGoalState } from "@/lib/goals";
import { monthlyEquivalent } from "@/lib/flows";
import { convert } from "@/lib/fx";
import type { ScenarioEvent } from "@/lib/projections";

/**
 * Server-side AI scenario generator.
 *
 * Why server-side: provider keys never leave the box. Same isolation
 * pattern as /api/chat — the action returns plain JSON, the browser
 * never touches the model directly. Also lets the prompt include the
 * full balance-sheet context without shipping it to the client first.
 */

/**
 * Flat event schema. Gemini's structured-output mode rejects JSON Schema
 * `oneOf` (which is what `z.discriminatedUnion` produces), so the wire
 * shape is a single object with `kind` + every possible field optional.
 * The client narrows it back into the proper `ScenarioEvent` discriminated
 * union via `flatEventToScenarioEvent` below.
 *
 * Don't ratchet this back to a discriminated union without re-checking
 * Gemini compatibility — it'll start throwing
 * "No object generated: response did not match schema" again.
 */
/**
 * Wire-format event schema. Gemini's structured-output mode rejects
 * JSON Schema `oneOf` (which is what `z.discriminatedUnion` produces),
 * so the wire shape is a single object with `kind` + every possible
 * field optional. We narrow it back to the strict ScenarioEvent below.
 *
 * Don't ratchet this back to a discriminated union without re-checking
 * Gemini compatibility — it'll start throwing
 * "No object generated: response did not match schema" again.
 */
const FlatEventSchema = z.object({
  kind: z.enum(["raise", "expense_shock", "lump_sum"]),
  atMonth: z.number().int().nonnegative(),
  /** For raise / expense_shock: the new monthly contribution from atMonth onward. */
  newMonthly: z.number().optional(),
  /** For lump_sum: the one-time amount injected (or withdrawn if negative). */
  amount: z.number().optional(),
  label: z.string().optional(),
});

const RawSuggestedScenarioSchema = z.object({
  name: z.string(),
  /** WHY this scenario is worth modeling — anchors on the user's data. */
  rationale: z.string(),
  /** WHAT the user would experience / sacrifice / achieve under this path. */
  summary: z.string(),
  monthlyContribution: z.number(),
  annualReturnPct: z.number(),
  horizonMonths: z.number().int(),
  events: z.array(FlatEventSchema),
});

const ResponseSchema = z.object({
  scenarios: z.array(RawSuggestedScenarioSchema),
});

/**
 * Public client-facing shape — the events array is narrowed to the
 * strict ScenarioEvent discriminated union the engine expects.
 */
export type SuggestedScenario = {
  name: string;
  rationale: string;
  summary: string;
  monthlyContribution: number;
  annualReturnPct: number;
  horizonMonths: number;
  events: ScenarioEvent[];
};

/**
 * Narrow a flat AI-returned event into the strict ScenarioEvent shape.
 * Drops events missing their required field (e.g. a lump_sum without
 * an `amount`) — better to silently skip than poison the projection.
 */
function flatToScenarioEvent(
  e: z.infer<typeof FlatEventSchema>,
): ScenarioEvent | null {
  if (e.kind === "lump_sum") {
    if (typeof e.amount !== "number" || !Number.isFinite(e.amount)) return null;
    return {
      kind: "lump_sum",
      atMonth: e.atMonth,
      amount: e.amount,
      label: e.label,
    };
  }
  if (typeof e.newMonthly !== "number" || !Number.isFinite(e.newMonthly)) {
    return null;
  }
  return {
    kind: e.kind,
    atMonth: e.atMonth,
    newMonthly: e.newMonthly,
    label: e.label,
  };
}

export type SuggestScenariosResult =
  | { ok: true; scenarios: SuggestedScenario[] }
  | { ok: false; error: string };

export type RefineScenarioResult =
  | { ok: true; scenario: SuggestedScenario }
  | { ok: false; error: string };

/**
 * Iterative refinement on a single scenario. Same data context as
 * `suggestScenarios` but constrained to ONE output, and the user's
 * existing scenario is shown as the starting point so the model
 * tweaks rather than restarts.
 *
 * Why a separate action: lets the user iterate inside the predict
 * workspace without nuking the rest of the generated set. "Make this
 * one more aggressive", "swap the lump sum for a recurring raise",
 * "what if expenses also drop 20%" — each is a one-scenario tweak.
 */
export async function refineScenario(
  current: SuggestedScenario,
  refinePrompt: string,
  goalId: number | null,
  horizonMonths: number = 60,
): Promise<RefineScenarioResult> {
  const result = await suggestScenarios(
    [
      "Refine the SINGLE scenario described below per the user's instruction. Return exactly ONE scenario in the response array. Keep horizon + currency rules identical.",
      "",
      `## Current scenario`,
      `- name: ${current.name}`,
      `- monthlyContribution: ${current.monthlyContribution}`,
      `- annualReturnPct: ${current.annualReturnPct}`,
      `- horizonMonths: ${current.horizonMonths}`,
      `- rationale: ${current.rationale}`,
      `- summary: ${current.summary}`,
      `- events (${current.events.length}): ${
        current.events
          .map((e) =>
            e.kind === "lump_sum"
              ? `lump_sum ${e.amount} @ ${e.atMonth}`
              : `${e.kind} → ${e.newMonthly} @ ${e.atMonth}`,
          )
          .join("; ") || "(none)"
      }`,
      "",
      `## User instruction`,
      refinePrompt.trim() || "Improve it — make it sharper or more realistic.",
    ].join("\n"),
    goalId,
    horizonMonths,
  );
  if (!result.ok) return { ok: false, error: result.error };
  if (result.scenarios.length === 0) {
    return { ok: false, error: "No refined scenario was returned." };
  }
  // Take the first; ignore extras even if the model returned several.
  return { ok: true, scenario: result.scenarios[0] };
}

export async function suggestScenarios(
  prompt: string,
  goalId: number | null,
  horizonMonths: number = 60,
): Promise<SuggestScenariosResult> {
  await assertAdmin();
  let client;
  try {
    client = await buildAdvisorClient();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Advisor not configured.",
    };
  }

  const baseCurrency = await getBaseCurrency();
  const [summary, cashFlow, goals, flows] = await Promise.all([
    computeNetWorth(baseCurrency),
    computeMonthlyCashFlow(baseCurrency),
    listSavingsGoals(),
    listFlows(),
  ]);

  // Per-currency flow breakdown so the model can SEE the multi-currency
  // shape of the user's life — instead of just a base-currency
  // aggregate that hides which currency the income lands in. Without
  // this, asking "what if I 3x my $1,600 USD income?" produces
  // proposals that ignore the dollar→naira conversion AND the floor
  // imposed by NGN-denominated expenses.
  type FlowSummary = {
    income: number;
    expenses: number;
    net: number;
    inBase: { income: number; expenses: number; net: number };
  };
  const byCurrency = new Map<string, FlowSummary>();
  for (const f of flows) {
    const cur = f.currency.toUpperCase();
    const monthlyNative = monthlyEquivalent(f.amount, f.cadence);
    const monthlyBase = await convert(monthlyNative, cur, baseCurrency);
    const bucket = byCurrency.get(cur) ?? {
      income: 0,
      expenses: 0,
      net: 0,
      inBase: { income: 0, expenses: 0, net: 0 },
    };
    if (f.kind === "income") {
      bucket.income += monthlyNative;
      bucket.inBase.income += monthlyBase;
    } else {
      bucket.expenses += monthlyNative;
      bucket.inBase.expenses += monthlyBase;
    }
    bucket.net = bucket.income - bucket.expenses;
    bucket.inBase.net = bucket.inBase.income - bucket.inBase.expenses;
    byCurrency.set(cur, bucket);
  }
  // Plausible upper bound for monthlyContribution: net inflow + any
  // realistic expense compression. We pass this as guardrail context
  // so the model doesn't propose "save 10x your net income".
  const realisticContributionCap = Math.max(
    0,
    cashFlow.income - Math.max(0, cashFlow.expenses * 0.4),
  );

  // Goal context: if the user is asking against a specific goal, include
  // the current state + ETA so the model can reason about the gap.
  let goalContext = "";
  if (goalId != null) {
    const goal = goals.find((g) => g.id === goalId);
    if (goal) {
      try {
        const state = await computeGoalState(goal, baseCurrency);
        goalContext = [
          `Selected goal: "${goal.name}" (${goal.kind})`,
          goal.targetAmount != null
            ? `- Target: ${goal.targetAmount} ${goal.currency}`
            : "",
          `- Current: ${state.current.toFixed(0)} ${goal.currency}`,
          `- Monthly contribution today: ${goal.monthlyContribution} ${goal.currency}`,
          `- Horizon: ${goal.horizonMonths} months${goal.targetDate ? ` (target date ${goal.targetDate})` : ""}`,
          state.etaMonths != null
            ? `- ETA at current pace: ${state.etaMonths} months`
            : "- ETA: not reachable at current contribution",
        ]
          .filter(Boolean)
          .join("\n");
      } catch {
        goalContext = `Selected goal: "${goal.name}" (state computation failed).`;
      }
    }
  }

  // Clamp the user-chosen horizon to the engine's safe range so a typo
  // ("1000 years") can't poison a downstream projection.
  const safeHorizon = Math.max(1, Math.min(360, Math.round(horizonMonths) || 60));
  const horizonYears = (safeHorizon / 12).toFixed(1);

  const systemPrompt = [
    "You are a personal finance scenario planner. Generate 3-5 DISTINCT, USEFUL projection scenarios for the user.",
    "Each scenario tests a different lever — raise/income bump, expense cut, lump sum (bonus/refund), longer horizon, higher contribution, or a mix.",
    "Use the user's actual numbers below. Don't invent figures or pick generic placeholders.",
    "",
    `## Currency rules`,
    `- Base currency: ${baseCurrency}. ALL numbers you output (monthlyContribution, event newMonthly, event amount) MUST be in ${baseCurrency}.`,
    `- The user's flows live in their NATIVE currencies (see "Monthly cash flow (recurring)" below). When the user says "$1,600 raise" or "₦200k cut", convert to ${baseCurrency} using the implied current rates from the data — don't ask for rates.`,
    `- Cite the user's currency context in the rationale so it's traceable: e.g. "USD income jumps from $1,600 to $4,800 (≈ ${baseCurrency} terms)" rather than just a base-currency number.`,
    "",
    "## Contribution rules (CRITICAL — most common failure mode)",
    "- `monthlyContribution` is the user's NET monthly SAVINGS — what's actually left over after expenses. NOT gross income, NOT income after the raise.",
    "- A raise increases income; expenses don't disappear. Contribution after a 3x raise = (3x income) − (existing expenses), NOT 3x income.",
    "- Stay at or below the 'Realistic monthlyContribution upper bound' shown in the data unless the user explicitly accepts cutting all discretionary spending.",
    "- If the user asks for 'aggressive savings', model it as a believable expense cut (e.g. 'expenses drop 30%') plus the raise — show both, don't just inflate the contribution.",
    "",
    `## Horizon`,
    `Every scenario MUST set horizonMonths to exactly ${safeHorizon} (about ${horizonYears} years). The user picked this — do not override it.`,
    "",
    "For each scenario, write TWO short pieces of context:",
    "  - rationale: 1 sentence on WHY this scenario is worth running for THIS user (anchor on their currencies / goal / cash flow).",
    "  - summary: 1 sentence on WHAT the path involves and what they'd land at — the practical takeaway. e.g. 'Hits the emergency fund 9 months earlier but requires sustaining ~80k/mo until December.'",
    "Both fields are required. Keep each under 25 words. No fluff, no headers, no bullets — plain prose.",
    "",
    "## Event shape rules",
    "  - For kind='raise' or kind='expense_shock': set the `newMonthly` field to the contribution AFTER the change. Do NOT set `amount`.",
    "  - For kind='lump_sum': set the `amount` field (positive = injection, negative = withdrawal). Do NOT set `newMonthly`.",
    `  - Always include 'atMonth' (0–${safeHorizon}). Always include 'kind'.`,
    "  - `label` is optional — short string like 'salary bump' or 'tax refund'.",
    "annualReturnPct: 0–20.  events: 0–6 per scenario.",
    "If a scenario has no mid-stream changes, return `events: []`.",
  ].join("\n");

  const perCurrencyLines: string[] = [];
  for (const [cur, b] of byCurrency.entries()) {
    perCurrencyLines.push(
      `- ${cur}: income ${b.income.toFixed(0)} ${cur} (≈ ${b.inBase.income.toFixed(0)} ${baseCurrency}), expenses ${b.expenses.toFixed(0)} ${cur} (≈ ${b.inBase.expenses.toFixed(0)} ${baseCurrency}), net ${b.net.toFixed(0)} ${cur}`,
    );
  }

  const dataPrompt = [
    `## Base currency: ${baseCurrency}`,
    `## Liquid net worth (floor scenario): ${summary.totals.floor.toFixed(0)} ${baseCurrency}`,
    "",
    "## Monthly cash flow (recurring) — NATIVE currencies, with base-currency equivalent",
    perCurrencyLines.length ? perCurrencyLines.join("\n") : "(no recurring flows)",
    "",
    "## Aggregated cash flow (base currency only — for sanity-checking)",
    `- Income:   ${cashFlow.income.toFixed(0)} ${baseCurrency}`,
    `- Expenses: ${cashFlow.expenses.toFixed(0)} ${baseCurrency}`,
    `- Net:      ${cashFlow.net.toFixed(0)} ${baseCurrency}${cashFlow.net < 0 ? " (drawing down)" : ""}`,
    "",
    `## Realistic monthlyContribution upper bound: ${realisticContributionCap.toFixed(0)} ${baseCurrency}`,
    "(This is income minus a 40%-expense floor. Don't exceed it unless the prompt explicitly says to ignore expenses entirely. A 'X% raise' affects income, not the contribution — savings still need to subtract expenses.)",
    "",
    goalContext ? `## ${goalContext}\n` : "",
    "## Active goals",
    goals.length
      ? goals
          .map(
            (g) =>
              `- ${g.name} (${g.kind}, target ${g.targetAmount ?? "n/a"} ${g.currency}, ${g.monthlyContribution}/mo, horizon ${g.horizonMonths}mo)`,
          )
          .join("\n")
      : "(none)",
    "",
    "## User's request",
    prompt.trim() || "(no specific question — propose what's most useful)",
  ].join("\n");

  try {
    const result = await generateText({
      model: client.model,
      system: systemPrompt,
      prompt: dataPrompt,
      // v6 structured-output API. The model is constrained to produce
      // a value matching ResponseSchema; result.output is fully typed.
      output: Output.object({ schema: ResponseSchema }),
    });
    // Narrow the wire-format flat events back into the strict
    // ScenarioEvent discriminated union the engine consumes. Force the
    // horizon back to the user's chosen value — the model is told to
    // honor it via the system prompt, but we don't trust that with
    // money math, so the action layer is the enforcement point.
    //
    // Soft cap on contribution + event newMonthly: 2× the realistic
    // upper bound. The model is allowed to push past the realistic
    // line for "aggressive" scenarios, but not into nonsense (e.g.
    // 10× net income). When clamped, the rationale already mentions
    // the lever, so we don't rewrite the prose — just the number.
    const hardCap = realisticContributionCap > 0
      ? realisticContributionCap * 2
      : Infinity;
    const clampMoney = (n: number) => {
      if (!Number.isFinite(n)) return 0;
      if (hardCap === Infinity) return n;
      // Allow withdrawals (negative) — the cap is an upper bound only.
      return Math.min(n, hardCap);
    };
    const scenarios: SuggestedScenario[] = result.output.scenarios.map((s) => ({
      name: s.name,
      rationale: s.rationale,
      summary: s.summary,
      monthlyContribution: clampMoney(s.monthlyContribution),
      annualReturnPct: s.annualReturnPct,
      horizonMonths: safeHorizon,
      events: s.events
        .map(flatToScenarioEvent)
        .filter((e): e is ScenarioEvent => e != null)
        .map((e): ScenarioEvent => {
          if (e.kind === "lump_sum") return e;
          return { ...e, newMonthly: clampMoney(e.newMonthly) };
        }),
    }));
    return { ok: true, scenarios };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to generate scenarios.",
    };
  }
}
