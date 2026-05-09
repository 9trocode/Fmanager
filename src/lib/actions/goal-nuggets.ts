"use server";

import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { buildAdvisorClient } from "@/lib/ai/provider";
import {
  getBaseCurrency,
  getSavingsGoal,
  listAccountsWithEffective,
} from "@/lib/db/queries";
import { computeCashRunway } from "@/lib/aggregation";
import { computeGoalState } from "@/lib/goals";

/**
 * Goal "nuggets" — small advisor-generated insights surfaced on the
 * goal detail page. Educational + forward-looking: "what hitting this
 * unlocks", "what to do next", "what to watch out for". Distinct from
 * scenario predictions (which model paths) and from alerts (which
 * react to current state); nuggets are the proactive context the
 * advisor would mention if it were sitting next to you.
 *
 * Generated lazily on goal-page render and not persisted — they're
 * stateless commentary that should reflect the latest goal/account
 * state every time. Cheap one-shot model call; no tools, structured
 * output enforced.
 */

const NuggetSchema = z.object({
  kind: z.enum(["unlock", "next_step", "watch", "did_you_know"]),
  text: z.string(),
});

const ResponseSchema = z.object({
  nuggets: z.array(NuggetSchema),
});

export type GoalNugget = z.infer<typeof NuggetSchema>;
export type GoalNuggetsResult =
  | { ok: true; nuggets: GoalNugget[] }
  | { ok: false; error: string };

export async function getGoalNuggets(
  goalId: number,
): Promise<GoalNuggetsResult> {
  await assertAdmin();
  const goal = await getSavingsGoal(goalId);
  if (!goal) return { ok: false, error: "Goal not found." };
  let client;
  try {
    client = await buildAdvisorClient();
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Advisor not configured.",
    };
  }

  const baseCurrency = await getBaseCurrency();
  const [state, runway, accounts] = await Promise.all([
    computeGoalState(goal, baseCurrency),
    computeCashRunway(baseCurrency),
    listAccountsWithEffective(),
  ]);

  // Brief account roster — names + types + balances — so the model
  // can reference what the user actually has when proposing
  // next-step ideas.
  const accountLines = accounts
    .filter((a) => !a.archived && a.effectiveValue != null)
    .map(
      (a) =>
        `- ${a.name} (${a.type}, ${a.currency}): ${a.effectiveValue!.toFixed(0)}`,
    )
    .join("\n");

  const systemPrompt = [
    "You are a personal-finance co-pilot writing 'nuggets' — short, concrete pieces of context for ONE specific user goal.",
    "Each nugget is ONE sentence. Aim for 3-5 nuggets total. No fluff, no hedging, no introductions.",
    "Use the user's actual numbers. Cite currencies they use. Reference real instruments where appropriate (money market funds, Treasury bills, Bamboo for USD exposure if NGN, brokerage, retirement accounts).",
    "",
    "Nugget kinds (mix them — don't dump 5 of one kind):",
    "  - unlock: what hitting this goal makes possible. e.g. 'At ₦5M emergency fund you can take a 4-month sabbatical without selling equity.'",
    "  - next_step: a concrete action once they're close to or past the goal. e.g. 'Once this hits target, redirect the 200k/mo into Treasury bills for ~17% APR.'",
    "  - watch: a risk or trap to be aware of. e.g. 'Watch FX drift — keeping this in NGN cash loses ~25%/yr to inflation.'",
    "  - did_you_know: a relevant fact tailored to their situation. e.g. 'A 12-month money market fund position would have earned ~₦600k on this balance last year.'",
    "",
    "Keep each nugget under 25 words. Plain prose, no markdown.",
  ].join("\n");

  const dataPrompt = [
    `## Goal: "${goal.name}"`,
    `- Kind: ${goal.kind}`,
    `- Currency: ${goal.currency}`,
    `- Target: ${goal.targetAmount ?? "n/a"}`,
    `- Current: ${state.current.toFixed(0)}`,
    `- Monthly contribution: ${goal.monthlyContribution}`,
    `- Horizon: ${goal.horizonMonths} months`,
    state.etaMonths != null
      ? `- ETA at current pace: ${state.etaMonths} months`
      : "- ETA: not reachable at current pace",
    goal.notes ? `- Notes: ${goal.notes}` : "",
    "",
    `## Base currency: ${baseCurrency}`,
    `## Runway`,
    `- Monthly expenses: ${runway.monthlyExpenses.toFixed(0)} ${baseCurrency}`,
    `- Monthly income: ${runway.monthlyIncome.toFixed(0)} ${baseCurrency}`,
    `- Liquid cash: ${runway.liquidCash.toFixed(0)} ${baseCurrency}`,
    `- Months runway: ${runway.monthsRunway?.toFixed(1) ?? "∞"}`,
    "",
    "## Accounts the user has",
    accountLines || "(none)",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await generateText({
      model: client.model,
      system: systemPrompt,
      prompt: dataPrompt,
      output: Output.object({ schema: ResponseSchema }),
    });
    // Cap to 5 even if the model returned more.
    return { ok: true, nuggets: result.output.nuggets.slice(0, 5) };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to generate nuggets.",
    };
  }
}
