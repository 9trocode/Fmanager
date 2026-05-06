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
  computeBudgetStatus,
} from "@/lib/aggregation";
import { getBaseCurrency, listRecentTransactions } from "@/lib/db/queries";
import { convert } from "@/lib/fx";
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
  const [
    decisions,
    accounts,
    grants,
    flows,
    summary,
    cashFlow,
    runway,
    recentTxs,
    budgets,
    savingsGoals,
  ] = await Promise.all([
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
    listRecentTransactions(30),
    computeBudgetStatus(baseCurrency),
    db
      .select()
      .from(schema.savingsGoals)
      .where(eq(schema.savingsGoals.archived, false)),
  ]);

  // Aggregate transactions in base currency.
  let txIncomeBase = 0;
  let txExpenseBase = 0;
  const byCategory: Record<string, { income: number; expense: number }> = {};
  for (const t of recentTxs) {
    if (t.kind === "transfer") continue;
    const inBase = await convert(t.amount, t.currency, baseCurrency);
    const cat = t.category ?? "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
    if (t.kind === "income") {
      txIncomeBase += inBase;
      byCategory[cat].income += inBase;
    } else if (t.kind === "expense") {
      txExpenseBase += inBase;
      byCategory[cat].expense += inBase;
    }
  }
  const txNet = txIncomeBase - txExpenseBase;

  // Top 3 transactions by absolute amount in base currency, excluding transfers.
  const txWithBase = await Promise.all(
    recentTxs
      .filter((t) => t.kind !== "transfer")
      .map(async (t) => ({
        t,
        baseAmount: await convert(t.amount, t.currency, baseCurrency),
      })),
  );
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const topTxs = txWithBase
    .sort((a, b) => Math.abs(b.baseAmount) - Math.abs(a.baseAmount))
    .slice(0, 3);

  const lines: string[] = [
    "You are a personal finance co-pilot for a co-founder. Sharp, direct, honest.",
    "This is the user's PERSONAL financial life — their household balance sheet, cash flow, savings, and decisions. The company stake is just one asset on it. This is NOT a tool for managing the company's books or calculating company runway.",
    "Anchor every recommendation on the user's active personal decisions below — generic advice is a failure.",
    "When discussing net worth: always distinguish FLOOR (equity worth zero), LIQUID (current FMV, post-tax), and EXPECTED (target exit, post-tax). Equity that isn't vested or liquid is paper, not cash.",
    "Use real numbers from the data. Push back if a question is missing context. Prefer specific advice with explicit tradeoffs over hedged generalities.",
    "",
    `## Net worth (in ${baseCurrency})`,
    `- Floor:    ${fmt(summary.totals.floor, baseCurrency)}`,
    `- Liquid:   ${fmt(summary.totals.liquid, baseCurrency)}`,
    `- Expected: ${fmt(summary.totals.expected, baseCurrency)}`,
    "",
    "## Personal cash coverage",
    runway.monthlyExpenses === 0
      ? "(no recurring expenses tracked yet)"
      : [
          `- Liquid cash:       ${fmt(runway.liquidCash, baseCurrency)}`,
          `- Monthly expenses:  ${fmt(runway.monthlyExpenses, baseCurrency)}`,
          `- Monthly income:    ${fmt(runway.monthlyIncome, baseCurrency)}`,
          `- Net monthly:       ${fmt(runway.netMonthly, baseCurrency)}${runway.netMonthly < 0 ? " (drawing down)" : ""}`,
          `- Months covered (expenses-only): ${runway.monthsRunway != null ? runway.monthsRunway.toFixed(1) : "∞"}`,
          runway.monthsNetRunway != null
            ? `- Months covered (net of income): ${runway.monthsNetRunway.toFixed(1)}`
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
    "## Budgets vs spending (this month)",
    budgets.rows.length === 0
      ? "(no budgets configured)"
      : [
          ...budgets.rows.map((b) => {
            const flag = b.percentUsed > 100 ? " ⚠ OVER" : "";
            return `- ${b.category}: ${fmt(b.spentThisMonth, b.baseCurrency)} / ${fmt(b.monthlyLimit, b.baseCurrency)} (${b.percentUsed.toFixed(0)}% used)${flag}`;
          }),
          budgets.overBudget.length
            ? `- Over-budget categories: ${budgets.overBudget.map((b) => `${b.category} (+${(b.percentUsed - 100).toFixed(0)}%)`).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
    "",
    "## Savings goals (active)",
    savingsGoals.length === 0
      ? "(no savings goals)"
      : savingsGoals
          .map((g) => {
            const pctTxt =
              g.targetAmount != null && g.targetAmount > 0
                ? `${Math.min(100, (g.currentAmount / g.targetAmount) * 100).toFixed(0)}%`
                : "—";
            return `- ${g.name}${g.category ? ` [${g.category}]` : ""}: ${fmt(g.currentAmount, g.currency)}${g.targetAmount != null ? ` / ${fmt(g.targetAmount, g.currency)} (${pctTxt})` : ""}; +${fmt(g.monthlyContribution, g.currency)}/mo for ${g.horizonMonths}mo at ${g.expectedReturnPct}%/yr`;
          })
          .join("\n"),
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
    "",
    "## Transactions (last 30 days)",
    recentTxs.length === 0
      ? "(none logged)"
      : [
          `- Total income:   ${fmt(txIncomeBase, baseCurrency)}`,
          `- Total expenses: ${fmt(txExpenseBase, baseCurrency)}`,
          `- Net:            ${fmt(txNet, baseCurrency)}${txNet < 0 ? " (burning)" : ""}`,
          "- Per-category breakdown:",
          ...Object.entries(byCategory).map(([cat, v]) => {
            const parts: string[] = [];
            if (v.income > 0) parts.push(`+${fmt(v.income, baseCurrency)} in`);
            if (v.expense > 0) parts.push(`−${fmt(v.expense, baseCurrency)} out`);
            return `   · ${cat}: ${parts.join(", ")}`;
          }),
          topTxs.length
            ? `- Largest single transactions: ${topTxs
                .map(({ t, baseAmount }) => {
                  const sign = t.kind === "income" ? "+" : "−";
                  const accName =
                    accountNameById.get(t.accountId) ?? `acc#${t.accountId}`;
                  const cat = t.category ? ` [${t.category}]` : "";
                  return `${sign}${fmt(Math.abs(baseAmount), baseCurrency)} on ${t.occurredAt} (${accName})${cat}`;
                })
                .join("; ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
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
