import { NextResponse } from "next/server";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isAuthenticated, getRole } from "@/lib/auth/session";
import { buildAdvisorClient } from "@/lib/ai/provider";
import { advisorTools } from "@/lib/ai/tools";
import {
  maybeAutoTitle,
  upsertChatMessage,
} from "@/lib/actions/chat";
import {
  computeNetWorth,
  computeMonthlyCashFlow,
  computeCashRunway,
  computeBudgetStatus,
} from "@/lib/aggregation";
import { getBaseCurrency, listRecentTransactions } from "@/lib/db/queries";
import { prefetchRates } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { monthlyEquivalent } from "@/lib/flows";

export const runtime = "nodejs";
// Streamed responses can run longer than the default — give the model
// enough headroom for tool-call chains.
export const maxDuration = 60;

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

  // One pass over the txs after resolving every (currency → base)
  // rate up front. Was: two awaited convert() calls per tx (one for
  // the by-category aggregate, one for the top-tx sort) — both now
  // synchronous against a prefetched rate map.
  const rates = await prefetchRates(
    recentTxs.map((t) => [t.currency, baseCurrency] as const),
  );
  let txIncomeBase = 0;
  let txExpenseBase = 0;
  const byCategory: Record<string, { income: number; expense: number }> = {};
  const txWithBase: Array<{ t: (typeof recentTxs)[number]; baseAmount: number }> = [];
  for (const t of recentTxs) {
    if (t.kind === "transfer") continue;
    const inBase = rates.convert(t.amount, t.currency, baseCurrency);
    const cat = t.category ?? "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = { income: 0, expense: 0 };
    if (t.kind === "income") {
      txIncomeBase += inBase;
      byCategory[cat].income += inBase;
    } else if (t.kind === "expense") {
      txExpenseBase += inBase;
      byCategory[cat].expense += inBase;
    }
    txWithBase.push({ t, baseAmount: inBase });
  }
  const txNet = txIncomeBase - txExpenseBase;
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
  const topTxs = txWithBase
    .sort((a, b) => Math.abs(b.baseAmount) - Math.abs(a.baseAmount))
    .slice(0, 3);

  const lines: string[] = [
    "You are a personal finance co-pilot. Sharp, direct, honest, and PROACTIVE.",
    "This is the user's PERSONAL financial life — their household balance sheet, cash flow, savings, and decisions. The company stake is just one asset on it. This is NOT a tool for managing the company's books or calculating company runway.",
    "Anchor every recommendation on the user's active personal decisions below — generic advice is a failure.",
    "When discussing net worth: always distinguish FLOOR (equity worth zero), LIQUID (current FMV, post-tax), and EXPECTED (target exit, post-tax). Equity that isn't vested or liquid is paper, not cash.",
    "Use real numbers from the data. Push back if a question is missing context. Prefer specific advice with explicit tradeoffs over hedged generalities.",
    "",
    "## ALWAYS write a reply",
    "After at most 2-3 read-tool calls, you MUST write a substantive text response to the user. Do NOT chain four-plus tool calls in a row without prose. Tool results are context for YOUR answer, not the answer itself. The user sees nothing if you only call tools.",
    "If a write tool succeeds, follow it with a one-line confirmation in plain English. If a tool fails, tell the user what went wrong and what you'd do next.",
    "",
    "## Be proactive",
    "The user has explicitly asked you to act like a real advisor — not a passive Q&A bot. Don't just answer; review, validate, comment, alarm.",
    "- ALARM when going broke. At the start of any meaningful turn, call getRunwayCheck. If severity is 'critical' (< 3 months runway), open your reply with a one-line warning and what you'd do about it. If 'tight' (3–6 months), flag it as a watch-item.",
    "- VALIDATE actions before taking them. Before creating a transaction, budget, or flow, briefly check it against existing data (getBudgetStatus, listFlows, getRunwayCheck) so you can flag conflicts ('this'd push Food 12% over budget — still proceed?').",
    "- LEAVE NOTES as you go. When the user says something context-rich ('I'll revisit this after rent hits', 'this spike was the visa fee'), call addNote on the relevant entity. When you spot a pattern worth remembering ('Food has been over for 3 months running'), note it on the budget. Notes persist across sessions and become the advisor's memory.",
    "- REVIEW periodically. If the conversation is open-ended ('how am I doing?'), pull a few snapshots — getNetWorth, getRunwayCheck, getBudgetStatus, listSavingsGoals — and synthesize, don't just dump.",
    "- DECIDE decisions when the user reaches a clear conclusion. Call decideDecision with the outcome string so the dashboard reflects the resolution.",
    "",
    "## Tool use",
    "READ tools: listAccounts, listBudgets, listSavingsGoals, listFlows, listDecisions, listGrants, listTransactions.",
    "COMPUTED snapshots: getNetWorth, getRunwayCheck, getBudgetStatus, getCashFlow, getAccountBalances.",
    "FX (cached): getExchangeRate(base, quote), convertCurrency(amount, from, to). NEVER ask the user for an exchange rate — these tools already know. The app keeps rates in fx_rates with a 12h freshness window.",
    "WRITE tools: createTransaction, createBudget, updateBudget, createFlow, updateFlow, createSavingsGoal, updateSavingsGoal, createAccount, updateLoanTerms, decideDecision, addNote.",
    "- Always call a list/compute tool before any write that references an id, so you pass a real one.",
    "- Confirm BEFORE the tool call if the action is large, irreversible, or ambiguous (e.g. 'I'll log a NGN 700,000 expense to Salary — confirm?').",
    "- For small, routine logs the user explicitly asks for ('log 50 USD coffee'), proceed without extra confirmation but report what you did clearly.",
    "- After a tool runs, summarise what changed in plain English with the new numbers.",
    "- If the user uploads a receipt or screenshot, extract: amount, date, currency, category, vendor — then call createTransaction. If the receipt currency differs from the destination account, call convertCurrency to compute the equivalent.",
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
          .map((a) => {
            // For loan accounts, include the terms so the advisor can
            // actually answer "should I pay this down vs. save?" without
            // round-tripping the user. Fields are nullable; the prompt
            // omits ones that aren't filled in so the model can ask
            // only for what's genuinely missing.
            const base = `- #${a.id} ${a.name} (${a.type}, ${a.currency})`;
            if (a.type !== "loan") return base;
            const bits: string[] = [];
            if (a.interestRatePct != null)
              bits.push(`${a.interestRatePct}% APR`);
            if (a.originalPrincipal != null)
              bits.push(
                `original ${fmt(a.originalPrincipal, a.currency)}`,
              );
            if (a.loanTermMonths != null)
              bits.push(`${a.loanTermMonths}-month term`);
            if (a.paymentDayOfMonth != null)
              bits.push(`pays day ${a.paymentDayOfMonth}`);
            return bits.length ? `${base} · ${bits.join(", ")}` : base;
          })
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
            const acct = accounts.find((a) => a.id === f.accountId);
            const acctNote = acct
              ? ` ${f.kind === "income" ? "→" : "←"} ${acct.name}${acct.type === "loan" ? " (loan)" : ""}`
              : " · no account linked";
            return `- ${sign} ${f.name}${f.category ? ` [${f.category}]` : ""}: ${f.amount} ${f.currency} ${f.cadence} (≈ ${sign}${fmt(m, f.currency)} / mo)${acctNote}`;
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
            return `- #${b.id} ${b.category}: ${fmt(b.spentThisMonth, b.baseCurrency)} / ${fmt(b.monthlyLimit, b.baseCurrency)} (${b.percentUsed.toFixed(0)}% used)${flag}`;
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
  const role = (await getRole()) ?? "admin";
  // Viewer role gets a read-only advisor — strip the write tools.
  const tools =
    role === "admin"
      ? advisorTools
      : { listAccounts: advisorTools.listAccounts, listBudgets: advisorTools.listBudgets };

  const body = (await req.json().catch(() => null)) as
    | { messages?: UIMessage[]; sessionId?: number }
    | null;
  const messages = body?.messages ?? [];
  const sessionId =
    typeof body?.sessionId === "number" && Number.isFinite(body.sessionId)
      ? body.sessionId
      : null;
  if (!messages.length) {
    return new NextResponse("messages required", { status: 400 });
  }

  // Persist the latest user message + auto-title the session on first
  // user turn. Done before kicking off the stream so a refresh during
  // generation finds the user's message already on the timeline.
  if (sessionId != null) {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) {
      try {
        await upsertChatMessage(sessionId, lastUser);
        const firstText = lastUser.parts.find(
          (p): p is { type: "text"; text: string } => p.type === "text",
        )?.text;
        if (firstText) await maybeAutoTitle(sessionId, firstText);
      } catch (err) {
        console.error("[chat] failed to persist user message:", err);
      }
    }
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

  try {
    const modelMessages = await convertToModelMessages(messages);
    const result = streamText({
      model: client.model,
      system: await buildSystemPrompt(),
      // `useChat` sends UIMessage shapes; convert to model-format messages.
      messages: modelMessages,
      tools,
      // Multi-step: let the model call a tool, see the result, then
      // call another or write the final answer. With ~22 tools and a
      // proactive system prompt encouraging review-style turns
      // (getRunwayCheck, getBudgetStatus, listActiveAlerts, etc.) the
      // old 5-step ceiling was too tight — a chain of read tools
      // could burn the budget before the model wrote any text. 8
      // gives headroom while still capping runaway loops.
      stopWhen: ({ steps }) => steps.length >= 8,
    });
    // `onFinish` on the UI message stream gives us the final assembled
    // assistant UIMessage(s) — exactly what we need to persist so the
    // page reload restores the conversation. Errors are swallowed so a
    // DB hiccup never breaks the stream the user is reading.
    return result.toUIMessageStreamResponse({
      onFinish:
        sessionId == null
          ? undefined
          : async ({ messages: finalMessages }) => {
              try {
                for (const m of finalMessages) {
                  if (m.role === "user") continue; // already persisted above
                  await upsertChatMessage(sessionId, m);
                }
              } catch (err) {
                console.error("[chat] failed to persist assistant turn:", err);
              }
            },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Advisor request failed.";
    return new NextResponse(message, { status: 502 });
  }
}
