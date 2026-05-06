import { NextResponse } from "next/server";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth/session";
import {
  computeNetWorth,
  computeMonthlyCashFlow,
  computeCashRunway,
} from "@/lib/aggregation";
import { getBaseCurrency } from "@/lib/db/queries";
import { formatMoney } from "@/lib/format";
import { monthlyEquivalent } from "@/lib/flows";

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

function fmt(value: number, currency: string): string {
  return formatMoney(value, currency, { compact: true });
}

async function buildSystemPrompt(): Promise<string> {
  const baseCurrency = await getBaseCurrency();
  const [decisions, accounts, grants, flows, summary, cashFlow, runway] =
    await Promise.all([
      db
        .select()
        .from(schema.decisions)
        .where(eq(schema.decisions.status, "open")),
      db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.archived, false)),
      db.select().from(schema.equityGrants),
      db
        .select()
        .from(schema.recurringFlows)
        .where(eq(schema.recurringFlows.archived, false)),
      computeNetWorth(baseCurrency),
      computeMonthlyCashFlow(baseCurrency),
      computeCashRunway(baseCurrency),
    ]);

  const lines: string[] = [
    "You are a finance co-pilot for a founder. Sharp, direct, honest.",
    "Anchor every recommendation on the user's active decisions below — generic advice is a failure.",
    "When discussing net worth: always distinguish FLOOR (equity worth zero), LIQUID (current FMV, post-tax), and EXPECTED (target exit, post-tax). Equity that isn't vested or liquid is paper, not cash.",
    "Use real numbers from the data. Push back if a question is missing context. Prefer specific advice with explicit tradeoffs over hedged generalities.",
    "",
    `## Net worth (in ${baseCurrency})`,
    `- Floor:    ${fmt(summary.totals.floor, baseCurrency)}`,
    `- Liquid:   ${fmt(summary.totals.liquid, baseCurrency)}`,
    `- Expected: ${fmt(summary.totals.expected, baseCurrency)}`,
    "",
    "## Cash runway",
    runway.monthlyExpenses === 0
      ? "(no recurring expenses tracked yet)"
      : [
          `- Liquid cash:       ${fmt(runway.liquidCash, baseCurrency)}`,
          `- Monthly expenses:  ${fmt(runway.monthlyExpenses, baseCurrency)}`,
          `- Monthly income:    ${fmt(runway.monthlyIncome, baseCurrency)}`,
          `- Net monthly:       ${fmt(runway.netMonthly, baseCurrency)}${runway.netMonthly < 0 ? " (burning)" : ""}`,
          `- Months runway (gross): ${runway.monthsRunway != null ? runway.monthsRunway.toFixed(1) : "∞"}`,
          runway.monthsNetRunway != null
            ? `- Months runway (net of income): ${runway.monthsNetRunway.toFixed(1)}`
            : "- Income covers expenses (net positive)",
        ].join("\n"),
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
    "## Accounts",
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
              `- ${g.company}: ${g.vestedShares}/${g.totalShares} vested @ strike ${g.strikePrice ?? "n/a"} ${g.currency}; FMV ${g.fmvPerShare ?? "n/a"}; exit ${g.exitPricePerShare ?? "n/a"}${g.expectedExitMonths != null ? `; exit in ${g.expectedExitMonths}mo` : ""}${g.taxRatePct != null ? `; tax ${g.taxRatePct}%` : ""}`,
          )
          .join("\n")
      : "(no equity grants tracked)",
    "",
    "## Recurring flows",
    flows.length
      ? flows
          .map((f) => {
            const m = monthlyEquivalent(f.amount, f.cadence);
            const sign = f.kind === "income" ? "+" : "−";
            return `- ${sign} ${f.name}${f.category ? ` [${f.category}]` : ""}: ${f.amount} ${f.currency} ${f.cadence} (≈ ${sign}${fmt(m, f.currency)} / mo)`;
          })
          .join("\n")
      : "(no recurring flows tracked)",
    "",
    "## Income vs expense by category (monthly, base currency)",
    `- Income breakdown: ${
      Object.keys(cashFlow.byCategory.income).length
        ? Object.entries(cashFlow.byCategory.income)
            .map(([k, v]) => `${k} ${fmt(v, baseCurrency)}`)
            .join(", ")
        : "(none)"
    }`,
    `- Expense breakdown: ${
      Object.keys(cashFlow.byCategory.expense).length
        ? Object.entries(cashFlow.byCategory.expense)
            .map(([k, v]) => `${k} ${fmt(v, baseCurrency)}`)
            .join(", ")
        : "(none)"
    }`,
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
