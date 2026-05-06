import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth/session";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import {
  SUGGESTED_EXPENSE_CATEGORIES,
  SUGGESTED_INCOME_CATEGORIES,
} from "@/lib/flows";

export const runtime = "nodejs";

async function getApiKey(): Promise<string | null> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "anthropic_api_key"))
    .limit(1);
  return row[0]?.value || process.env.ANTHROPIC_API_KEY || null;
}

async function getModelId(): Promise<string> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "advisor_model"))
    .limit(1);
  return row[0]?.value || "claude-sonnet-4-6";
}

const VoiceSchema = z.object({
  vendor: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z
    .enum([...SUPPORTED_CURRENCIES] as [string, ...string[]])
    .nullable(),
  occurredAt: z.string().nullable(),
  suggestedCategory: z.string().nullable(),
  // 'kind' inferred from language — expense vs income. Default to expense if ambiguous.
  kind: z.enum(["expense", "income"]).nullable(),
  notes: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
});

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return new NextResponse(
      "No Anthropic API key configured. Add one in Settings → Advisor or set ANTHROPIC_API_KEY.",
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    transcript?: string;
  } | null;
  const transcript = body?.transcript?.trim();
  if (!transcript) {
    return new NextResponse("transcript required", { status: 400 });
  }

  const anthropic = createAnthropic({ apiKey });
  const modelId = await getModelId();

  const today = new Date().toISOString().slice(0, 10);

  const promptText = [
    "You are parsing a spoken description of a money movement into structured fields.",
    `Today is ${today}.`,
    "The user is a founder logging an expense or income. Return null for fields they didn't mention; do not invent.",
    `Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}.`,
    "If the user says a currency symbol or name (₦, naira, $, dollars, €, euros, £, pounds, ¥, yen, CHF, francs), pick the matching ISO code.",
    `For an expense, choose a category from: ${SUGGESTED_EXPENSE_CATEGORIES.join(", ")}.`,
    `For income, choose from: ${SUGGESTED_INCOME_CATEGORIES.join(", ")}.`,
    "If no listed category fits, propose a short one of your own.",
    "kind: 'income' if it's money received (paid, received, got), 'expense' if money out (spent, bought, paid for). Default to expense if ambiguous.",
    "amount is a positive number with no currency symbol.",
    "occurredAt: parse relative dates ('yesterday', 'last Tuesday') against today's date and return YYYY-MM-DD; null if not mentioned.",
    "vendor is the counter-party (who you paid / who paid you). notes is the descriptive context (with whom, for what).",
    "Set confidence honestly.",
    "",
    `Transcript: """${transcript}"""`,
  ].join(" ");

  try {
    const { output } = await generateText({
      model: anthropic(modelId),
      output: Output.object({ schema: VoiceSchema }),
      prompt: promptText,
    });
    return NextResponse.json(output);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Voice parsing failed.";
    return new NextResponse(message, { status: 502 });
  }
}
