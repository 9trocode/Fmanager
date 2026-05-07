"use server";

import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { buildAdvisorClient } from "@/lib/ai/provider";
import { computeMonthlyCashFlow, computeNetWorth } from "@/lib/aggregation";
import { listSavingsGoals, getBaseCurrency } from "@/lib/db/queries";
import { computeGoalState } from "@/lib/goals";
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
  const [summary, cashFlow, goals] = await Promise.all([
    computeNetWorth(baseCurrency),
    computeMonthlyCashFlow(baseCurrency),
    listSavingsGoals(),
  ]);

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
    "Express monthly amounts in the user's base currency. Events use atMonth offsets from today (0 = next month).",
    "",
    `HORIZON: every scenario MUST set horizonMonths to exactly ${safeHorizon} (about ${horizonYears} years). The user picked this — do not override it. Tune the LEVERS (contribution, return, events) to fit the horizon, not the other way around.`,
    "",
    "For each scenario, write TWO short pieces of context:",
    "  - rationale: 1 sentence on WHY this scenario is worth running for THIS user (anchor on their numbers / goal / cash flow).",
    "  - summary: 1 sentence on WHAT the path involves and what they'd land at — the practical takeaway. e.g. 'Hits the emergency fund 9 months earlier but requires sustaining ~80k/mo until December.'",
    "Both fields are required. Keep each under 25 words. No fluff, no headers, no bullets — plain prose.",
    "",
    "Event shape rules:",
    "  - For kind='raise' or kind='expense_shock': set the `newMonthly` field to the contribution AFTER the change. Do NOT set `amount`.",
    "  - For kind='lump_sum': set the `amount` field (positive = injection, negative = withdrawal). Do NOT set `newMonthly`.",
    `  - Always include 'atMonth' (0–${safeHorizon}). Always include 'kind'.`,
    "  - `label` is optional — short string like 'salary bump' or 'tax refund'.",
    "annualReturnPct: 0–20.  events: 0–6 per scenario.",
    "If a scenario has no mid-stream changes, return `events: []`.",
  ].join("\n");

  const dataPrompt = [
    `## Base currency: ${baseCurrency}`,
    `## Liquid net worth (floor scenario): ${summary.totals.floor.toFixed(0)} ${baseCurrency}`,
    `## Monthly cash flow (recurring)`,
    `- Income:   ${cashFlow.income.toFixed(0)} ${baseCurrency}`,
    `- Expenses: ${cashFlow.expenses.toFixed(0)} ${baseCurrency}`,
    `- Net:      ${cashFlow.net.toFixed(0)} ${baseCurrency}${cashFlow.net < 0 ? " (drawing down)" : ""}`,
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
    const scenarios: SuggestedScenario[] = result.output.scenarios.map((s) => ({
      name: s.name,
      rationale: s.rationale,
      summary: s.summary,
      monthlyContribution: s.monthlyContribution,
      annualReturnPct: s.annualReturnPct,
      horizonMonths: safeHorizon,
      events: s.events
        .map(flatToScenarioEvent)
        .filter((e): e is ScenarioEvent => e != null),
    }));
    return { ok: true, scenarios };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to generate scenarios.",
    };
  }
}
