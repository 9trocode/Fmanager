"use server";

import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth/session";
import { buildAdvisorClient } from "@/lib/ai/provider";
import {
  getBaseCurrency,
  getBudget,
  listTransactions,
} from "@/lib/db/queries";

/**
 * Budget "nuggets" — short, locale-aware advisor commentary on one
 * budget's cap. Mirrors the goal-nuggets shape but tuned for the
 * different question budgets prompt: "is this cap realistic given
 * current prices?", "what's the local inflation doing to it?", and
 * "what could you actually buy at this number".
 *
 * Stateless: regenerated on each render to reflect the latest budget
 * state + spend. The model leans on its training data for general
 * economic context (typical Lagos food spend, US grocery inflation,
 * etc.) — it can't quote today's egg prices, but it can ground the
 * cap against typical ranges for the currency / category.
 */

const NuggetSchema = z.object({
  kind: z.enum(["benchmark", "economic", "compress", "expand", "did_you_know"]),
  text: z.string(),
});

const ResponseSchema = z.object({
  nuggets: z.array(NuggetSchema),
});

export type BudgetNugget = z.infer<typeof NuggetSchema>;
export type BudgetNuggetsResult =
  | { ok: true; nuggets: BudgetNugget[] }
  | { ok: false; error: string };

export async function getBudgetNuggets(
  budgetId: number,
): Promise<BudgetNuggetsResult> {
  await assertAdmin();
  const budget = await getBudget(budgetId);
  if (!budget) return { ok: false, error: "Budget not found." };
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

  // Recent realized spend in this category for context. Last 90 days
  // gives the model enough signal to spot trends without overwhelming
  // it. Filtered to expense kind only.
  const today = new Date();
  const since = new Date(today);
  since.setDate(since.getDate() - 90);
  const dateFrom = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  const recentTxs = await listTransactions({
    category: budget.category,
    kind: "expense",
    dateFrom,
    limit: 100,
  });
  const totalSpend90d = recentTxs.reduce(
    (acc, t) => acc + (t.currency === budget.currency ? t.amount : 0),
    0,
  );

  const systemPrompt = [
    "You are a personal-finance co-pilot writing 'nuggets' — short, concrete pieces of context for ONE specific budget cap.",
    "Each nugget is ONE sentence. Aim for 3-5 nuggets total. No fluff, no hedging, no headers.",
    "Anchor the cap against TYPICAL prices and CURRENT economics for the budget's CURRENCY context. You don't have today's prices, but you have general training-data-level context: rough Lagos / Nigeria living costs in NGN, US household ranges in USD, EU averages in EUR, etc. Use it.",
    "When relevant: cite inflation rates ('NGN inflation has been ~25%/yr'), purchasing power loss, and what typical households in that currency context spend on this category.",
    "",
    "Nugget kinds (mix them — don't dump 5 of one kind):",
    "  - benchmark: how this cap compares to typical for the category + currency. e.g. 'A single-person Lagos food budget typically lands ₦120k–₦180k/mo in 2025; you're mid-range.'",
    "  - economic: macro context relevant to the cap. e.g. 'NGN food inflation ran ~33% YoY recently — last year's cap won't cover this year's basket.'",
    "  - compress: a concrete tightening lever. e.g. 'Cooking 4 nights/week instead of takeout typically cuts a US food budget 25-35%.'",
    "  - expand: when the cap looks too tight given prices. e.g. 'Lagos rent for a 2-bed in Lekki is ₦4-7M/yr; ₦300k/mo is below market.'",
    "  - did_you_know: a relevant fact. e.g. 'Bamboo + USD-denominated MMFs let NGN earners hedge food-import-driven inflation.'",
    "",
    "Keep each nugget under 25 words. Plain prose, no markdown. Reference the category by name.",
  ].join("\n");

  const dataPrompt = [
    `## Budget: "${budget.category}"`,
    `- Cap: ${budget.monthlyLimit} ${budget.currency} / month`,
    `- Account-scoped: ${budget.accountId != null ? `yes (account #${budget.accountId})` : "no — counts every account"}`,
    budget.notes ? `- Notes: ${budget.notes}` : "",
    "",
    `## Spend in this category over the last 90 days`,
    `- Total realized: ${totalSpend90d.toFixed(0)} ${budget.currency}`,
    `- Transactions: ${recentTxs.length}`,
    `- Avg / month: ${(totalSpend90d / 3).toFixed(0)} ${budget.currency}`,
    "",
    `## Base currency: ${baseCurrency}`,
    `## Today: ${today.toISOString().slice(0, 10)}`,
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
    return { ok: true, nuggets: result.output.nuggets.slice(0, 5) };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to generate nuggets.",
    };
  }
}
