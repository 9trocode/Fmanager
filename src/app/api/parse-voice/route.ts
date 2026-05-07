import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth/session";
import { SUPPORTED_CURRENCIES } from "@/lib/format";
import {
  SUGGESTED_EXPENSE_CATEGORIES,
  SUGGESTED_INCOME_CATEGORIES,
} from "@/lib/flows";
import { buildAdvisorClient } from "@/lib/ai/provider";
import { localToday } from "@/lib/dates";

export const runtime = "nodejs";

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

  const body = (await req.json().catch(() => null)) as {
    transcript?: string;
  } | null;
  const transcript = body?.transcript?.trim();
  if (!transcript) {
    return new NextResponse("transcript required", { status: 400 });
  }

  let client;
  try {
    client = await buildAdvisorClient();
  } catch (err) {
    return new NextResponse(
      err instanceof Error ? err.message : "Advisor not configured.",
      { status: 400 },
    );
  }

  const today = localToday();

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
      model: client.model,
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
