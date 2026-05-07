"use server";

import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { buildAdvisorClient } from "@/lib/ai/provider";
import { computeMonthlyCashFlow, computeNetWorth } from "@/lib/aggregation";
import { listSavingsGoals, getBaseCurrency } from "@/lib/db/queries";
import { computeGoalState } from "@/lib/goals";

/**
 * Server-side AI scenario generator.
 *
 * Why server-side: provider keys never leave the box. Same isolation
 * pattern as /api/chat — the action returns plain JSON, the browser
 * never touches the model directly. Also lets the prompt include the
 * full balance-sheet context without shipping it to the client first.
 */

const ScenarioEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("raise"),
    atMonth: z.number().int().nonnegative(),
    newMonthly: z.number(),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal("expense_shock"),
    atMonth: z.number().int().nonnegative(),
    newMonthly: z.number(),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal("lump_sum"),
    atMonth: z.number().int().nonnegative(),
    amount: z.number(),
    label: z.string().optional(),
  }),
]);

const SuggestedScenarioSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(48)
    .describe("Short distinctive name e.g. 'Raise in 6mo' or 'Tighten food/dining'."),
  rationale: z
    .string()
    .min(8)
    .describe(
      "One-to-two sentence explanation of WHY this scenario is worth modeling against the user's actual data. No fluff.",
    ),
  monthlyContribution: z
    .number()
    .describe(
      "Steady monthly net contribution at the start of the run, in the user's base currency. Positive saves, negative draws down.",
    ),
  annualReturnPct: z
    .number()
    .min(0)
    .max(20)
    .describe("Blended annual return assumption on the non-grant principal."),
  horizonMonths: z
    .number()
    .int()
    .min(6)
    .max(360)
    .describe("How many months forward to project."),
  events: z
    .array(ScenarioEventSchema)
    .max(6)
    .describe("Mid-stream changes — raises, expense shocks, lump sums."),
});

export type SuggestedScenario = z.infer<typeof SuggestedScenarioSchema>;

const ResponseSchema = z.object({
  scenarios: z
    .array(SuggestedScenarioSchema)
    .min(1)
    .max(5)
    .describe("Distinct scenarios to compare. Each must differ meaningfully from the others."),
});

export type SuggestScenariosResult =
  | { ok: true; scenarios: SuggestedScenario[] }
  | { ok: false; error: string };

export async function suggestScenarios(
  prompt: string,
  goalId: number | null,
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

  const systemPrompt = [
    "You are a personal finance scenario planner. Generate 3-5 DISTINCT, USEFUL projection scenarios for the user.",
    "Each scenario should test a different lever — raise/income bump, expense cut, lump sum (bonus/refund), longer horizon, higher contribution, or a mix.",
    "Use the user's actual numbers below. Don't invent figures or pick generic placeholders.",
    "Express monthly amounts in the user's base currency. Events use atMonth offsets from today (0 = next month).",
    "Be concrete in rationales — 'lift contribution by 80k after the raise lands at month 6' beats 'save more'.",
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
    return { ok: true, scenarios: result.output.scenarios };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to generate scenarios.",
    };
  }
}
