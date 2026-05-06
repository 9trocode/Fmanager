import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth/session";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant" | "system"; content: string };

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

async function buildSystemPrompt(): Promise<string> {
  const decisions = await db
    .select()
    .from(schema.decisions)
    .where(eq(schema.decisions.status, "open"));

  const accounts = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.archived, false));

  const grants = await db.select().from(schema.equityGrants);

  const lines: string[] = [
    "You are a finance co-pilot for a founder. You are sharp, direct, and honest.",
    "You anchor every recommendation on the user's three real decisions below — generic advice is a failure.",
    "When discussing net worth: always distinguish FLOOR (equity worth zero), EXPECTED (target exit), and LIQUID (current 409A/FMV). Equity that is not vested or not liquid is paper, not cash.",
    "Be concrete. Use numbers from the user's data when relevant. Push back if a question is missing context.",
    "",
    "## Active decisions",
    decisions.length
      ? decisions
          .map(
            (d, i) =>
              `${i + 1}. ${d.question}${d.context ? `\n   context: ${d.context}` : ""}`,
          )
          .join("\n")
      : "(none yet — the user hasn't seeded decisions in Settings)",
    "",
    "## Accounts summary",
    accounts.length
      ? accounts
          .map((a) => `- ${a.name} (${a.type}, ${a.currency})`)
          .join("\n")
      : "(no accounts yet)",
    "",
    "## Equity grants",
    grants.length
      ? grants
          .map(
            (g) =>
              `- ${g.company}: ${g.vestedShares}/${g.totalShares} vested @ strike ${g.strikePrice ?? "n/a"} ${g.currency}; FMV ${g.fmvPerShare ?? "n/a"}; exit ${g.exitPricePerShare ?? "n/a"}`,
          )
          .join("\n")
      : "(no equity grants tracked)",
  ];

  return lines.join("\n");
}

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

  const body = (await req.json().catch(() => null)) as { messages?: Msg[] } | null;
  const messages = body?.messages ?? [];
  if (!messages.length) {
    return new NextResponse("messages required", { status: 400 });
  }

  const anthropic = createAnthropic({ apiKey });
  const modelId = await getModelId();

  try {
    const { text } = await generateText({
      model: anthropic(modelId),
      system: await buildSystemPrompt(),
      messages: messages.filter((m) => m.role !== "system"),
    });
    return NextResponse.json({ content: text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Advisor request failed.";
    return new NextResponse(message, { status: 502 });
  }
}
