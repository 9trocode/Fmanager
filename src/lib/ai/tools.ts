import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { accountTypes, flowCadences, flowKinds } from "@/lib/db/schema";
import {
  getBaseCurrency,
  listAccounts,
  listAccountsWithEffective,
  listFlows,
  listSavingsGoals,
  listDecisions,
  listGrants,
  listTransactions,
  type TransactionFilter,
} from "@/lib/db/queries";
import {
  computeBudgetStatus,
  computeCashRunway,
  computeMonthlyCashFlow,
  computeNetWorth,
} from "@/lib/aggregation";
import { getRate, convert } from "@/lib/fx";
import { listActiveAlerts } from "@/lib/advisor-alerts";
import { localToday } from "@/lib/dates";
import { eq } from "drizzle-orm";

/**
 * Tools the advisor can call on the user's behalf.
 *
 * Design notes:
 * - Every tool returns a structured result the model can incorporate into
 *   its next turn ("Created transaction #42 for −NGN 50,000 …"). The
 *   string field is suitable for surfacing to the user inline; the
 *   `data` is for the model to reason over.
 * - Tools that write are gated by the same admin assertion the rest of
 *   the app uses (the API route checks isAuthenticated + admin before
 *   passing tools to the model — this is defense in depth).
 * - Money tools take currency explicitly. We don't auto-FX so the model
 *   stays honest about which currency a number is in.
 */

// ─── lookups (read-only) ─────────────────────────────────────────────────

const listAccountsTool = tool({
  description:
    "List the user's accounts (id, name, type, currency, loan terms when applicable). Use this BEFORE any create/edit/delete that needs an accountId, so you pass a real id rather than guessing. For loan-type accounts, the response also includes interestRatePct, originalPrincipal, loanTermMonths, paymentDayOfMonth — so check there before asking the user for these.",
  inputSchema: z.object({}),
  execute: async () => {
    const accounts = await listAccounts();
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        institution: a.institution,
        // Loan-specific fields surfaced so the model doesn't ask for
        // them when they're already on file.
        ...(a.type === "loan"
          ? {
              interestRatePct: a.interestRatePct,
              originalPrincipal: a.originalPrincipal,
              loanTermMonths: a.loanTermMonths,
              paymentDayOfMonth: a.paymentDayOfMonth,
            }
          : {}),
      })),
    };
  },
});

const listBudgetsTool = tool({
  description:
    "List the user's active budgets (id, category, monthly limit, currency). Use to find an existing budget by category name.",
  inputSchema: z.object({}),
  execute: async () => {
    const rows = await db.select().from(schema.budgets);
    return {
      budgets: rows.map((b) => ({
        id: b.id,
        category: b.category,
        monthlyLimit: b.monthlyLimit,
        currency: b.currency,
        notes: b.notes,
      })),
    };
  },
});

// ─── transactions ────────────────────────────────────────────────────────

const createTransactionTool = tool({
  description:
    "Log a one-off transaction (income, expense, or transfer). For transfers, set destAccountId. Always confirm the user's intent if amount is large or unusual; small/routine logs can be created directly.",
  inputSchema: z.object({
    accountId: z.number().int().positive().describe("Source account id."),
    kind: z
      .enum(["income", "expense", "transfer"])
      .describe(
        "income or expense for normal cashflow; transfer for moving money between accounts.",
      ),
    amount: z.number().positive().describe("Always a positive number."),
    currency: z.string().min(3).max(3).describe("ISO code, e.g. NGN, USD."),
    occurredAt: z
      .string()
      .optional()
      .describe(
        "Date in YYYY-MM-DD. Defaults to today if omitted.",
      ),
    category: z.string().optional(),
    notes: z.string().optional(),
    destAccountId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Required when kind=transfer."),
  }),
  execute: async (input) => {
    if (input.kind === "transfer" && !input.destAccountId) {
      return { error: "Transfers require destAccountId." };
    }
    const [row] = await db
      .insert(schema.transactions)
      .values({
        kind: input.kind,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        accountId: input.accountId,
        destAccountId: input.destAccountId ?? null,
        occurredAt: input.occurredAt ?? localToday(),
        category: input.category ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return {
      ok: true,
      transactionId: row.id,
      summary: `${input.kind === "expense" ? "−" : input.kind === "income" ? "+" : "↔"}${input.amount} ${input.currency.toUpperCase()} on ${row.occurredAt}`,
    };
  },
});

// ─── budgets ─────────────────────────────────────────────────────────────

const createBudgetTool = tool({
  description:
    "Create a monthly budget for a spending category. The category string MUST match the `category` field on the transactions you want it to track. Optional `accountId` scopes the budget to spending on one account only — leave it off to track across every account.",
  inputSchema: z.object({
    category: z.string().min(1),
    monthlyLimit: z.number().positive(),
    currency: z.string().min(3).max(3),
    accountId: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Optional. Restrict counting to transactions on this account. Useful for per-card budgets.",
      ),
    notes: z.string().optional(),
  }),
  execute: async (input) => {
    const [row] = await db
      .insert(schema.budgets)
      .values({
        category: input.category,
        monthlyLimit: input.monthlyLimit,
        currency: input.currency.toUpperCase(),
        accountId: input.accountId ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return {
      ok: true,
      budgetId: row.id,
      summary: `Budget '${input.category}': ${input.monthlyLimit} ${input.currency.toUpperCase()}/mo${input.accountId ? ` (account ${input.accountId})` : ""}`,
    };
  },
});

const updateBudgetTool = tool({
  description: "Update an existing budget's monthly limit or notes.",
  inputSchema: z.object({
    budgetId: z.number().int().positive(),
    monthlyLimit: z.number().positive().optional(),
    notes: z.string().optional(),
  }),
  execute: async (input) => {
    const set: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (input.monthlyLimit != null) set.monthlyLimit = input.monthlyLimit;
    if (input.notes !== undefined) set.notes = input.notes;
    await db
      .update(schema.budgets)
      .set(set)
      .where(eq(schema.budgets.id, input.budgetId));
    return { ok: true };
  },
});

// ─── recurring flows ─────────────────────────────────────────────────────

const createFlowTool = tool({
  description:
    "Create a recurring cash flow (a fixed inflow like salary, or outflow like rent). The flow auto-accrues into transactions on the linked account at each cadence boundary, so net worth and the runway widget actually reflect it. Pass `nextDueAt` (YYYY-MM-DD) to anchor the schedule to a specific day — e.g. salary on the 25th of every month — instead of letting it drift relative to creation date.",
  inputSchema: z.object({
    name: z.string().min(1),
    kind: z.enum(flowKinds),
    amount: z.number().positive(),
    currency: z.string().min(3).max(3),
    cadence: z.enum(flowCadences).default("monthly"),
    accountId: z
      .number()
      .int()
      .positive()
      .describe(
        "Account that receives the income or pays the expense. Required for the auto-accrual to work.",
      ),
    category: z.string().optional(),
    nextDueAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        "Next date the flow should post (YYYY-MM-DD). If in the future, the first post is deferred until then.",
      ),
    notes: z.string().optional(),
  }),
  execute: async (input) => {
    const today = localToday();
    const deferToFuture =
      input.nextDueAt != null && input.nextDueAt > today;
    const [row] = await db
      .insert(schema.recurringFlows)
      .values({
        name: input.name,
        kind: input.kind,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        cadence: input.cadence,
        accountId: input.accountId,
        category: input.category ?? null,
        notes: input.notes ?? null,
        lastPostedAt: today,
        nextDueAt: input.nextDueAt ?? null,
      })
      .returning();
    // Mirror createFlow's behaviour: post immediately unless the
    // explicit nextDueAt is in the future.
    if (!deferToFuture) {
      await db.insert(schema.transactions).values({
        kind: row.kind,
        amount: row.amount,
        currency: row.currency,
        accountId: row.accountId!,
        occurredAt: input.nextDueAt ?? today,
        category: row.category,
        flowId: row.id,
        notes: row.notes ?? `Auto-posted from ${row.name}`,
      });
    }
    return {
      ok: true,
      flowId: row.id,
      summary: `${input.kind} flow '${input.name}': ${input.amount} ${input.currency.toUpperCase()} ${input.cadence}${input.nextDueAt ? ` (next ${input.nextDueAt})` : ""}`,
    };
  },
});

// ─── savings goals ──────────────────────────────────────────────────────

const createSavingsGoalTool = tool({
  description:
    "Create a savings goal with a monthly contribution and horizon. Used for emergency funds, milestones, FIRE targets, debt payoff, etc.",
  inputSchema: z.object({
    name: z.string().min(1),
    kind: z
      .enum(["savings", "net_worth", "fire", "debt_payoff"])
      .default("savings"),
    targetAmount: z.number().positive().optional(),
    currentAmount: z.number().nonnegative().default(0),
    currency: z.string().min(3).max(3),
    monthlyContribution: z.number().nonnegative().default(0),
    horizonMonths: z.number().int().positive().default(18),
    expectedReturnPct: z.number().min(0).max(20).default(4),
    category: z.string().optional(),
    notes: z.string().optional(),
  }),
  execute: async (input) => {
    const [row] = await db
      .insert(schema.savingsGoals)
      .values({
        name: input.name,
        kind: input.kind,
        targetAmount: input.targetAmount ?? null,
        currentAmount: input.currentAmount,
        currency: input.currency.toUpperCase(),
        monthlyContribution: input.monthlyContribution,
        horizonMonths: input.horizonMonths,
        expectedReturnPct: input.expectedReturnPct,
        startedAt: localToday(),
        category: input.category ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return {
      ok: true,
      goalId: row.id,
      summary: `Goal '${input.name}': ${input.monthlyContribution} ${input.currency.toUpperCase()}/mo for ${input.horizonMonths}mo`,
    };
  },
});

// ─── accounts ───────────────────────────────────────────────────────────

const createAccountTool = tool({
  description:
    "Add a new account (cash, brokerage, crypto, retirement, real estate, loan, etc.) with an opening balance. For `type: 'loan'`, ALSO pass interestRatePct + originalPrincipal when known — without those the advisor can't price debt vs savings tradeoffs.",
  inputSchema: z.object({
    name: z.string().min(1),
    type: z.enum(accountTypes),
    currency: z.string().min(3).max(3),
    openingBalance: z.number().default(0).describe("Today's balance."),
    institution: z.string().optional(),
    notes: z.string().optional(),
    // Loan-only fields. Ignored for non-loan types.
    interestRatePct: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Annual percentage rate, e.g. 22.5"),
    originalPrincipal: z
      .number()
      .positive()
      .optional()
      .describe("What the loan started at, in account currency."),
    loanTermMonths: z.number().int().positive().optional(),
    paymentDayOfMonth: z.number().int().min(1).max(31).optional(),
  }),
  execute: async (input) => {
    const [acct] = await db
      .insert(schema.accounts)
      .values({
        name: input.name,
        type: input.type,
        currency: input.currency.toUpperCase(),
        institution: input.institution ?? null,
        notes: input.notes ?? null,
        interestRatePct:
          input.type === "loan" ? (input.interestRatePct ?? null) : null,
        originalPrincipal:
          input.type === "loan" ? (input.originalPrincipal ?? null) : null,
        loanTermMonths:
          input.type === "loan" ? (input.loanTermMonths ?? null) : null,
        paymentDayOfMonth:
          input.type === "loan" ? (input.paymentDayOfMonth ?? null) : null,
      })
      .returning();
    // Seed an opening snapshot so net worth picks it up immediately.
    await db.insert(schema.valueSnapshots).values({
      accountId: acct.id,
      asOf: localToday(),
      value: input.openingBalance,
      currency: input.currency.toUpperCase(),
    });
    return {
      ok: true,
      accountId: acct.id,
      summary: `Account '${input.name}' (${input.type}, ${input.currency.toUpperCase()}) opened at ${input.openingBalance}`,
    };
  },
});

const updateLoanTermsTool = tool({
  description:
    "Update the loan-specific fields on an existing loan account: interest rate, original principal, term, payment day. Use this when the user supplies these in conversation so future advice doesn't need to ask again.",
  inputSchema: z.object({
    accountId: z.number().int().positive(),
    interestRatePct: z.number().min(0).max(100).optional(),
    originalPrincipal: z.number().positive().optional(),
    loanTermMonths: z.number().int().positive().optional(),
    paymentDayOfMonth: z.number().int().min(1).max(31).optional(),
  }),
  execute: async (input) => {
    const set: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (input.interestRatePct != null) set.interestRatePct = input.interestRatePct;
    if (input.originalPrincipal != null)
      set.originalPrincipal = input.originalPrincipal;
    if (input.loanTermMonths != null) set.loanTermMonths = input.loanTermMonths;
    if (input.paymentDayOfMonth != null)
      set.paymentDayOfMonth = input.paymentDayOfMonth;
    await db
      .update(schema.accounts)
      .set(set)
      .where(eq(schema.accounts.id, input.accountId));
    return { ok: true };
  },
});

// ─── FX (cached in DB) ──────────────────────────────────────────────────

const getExchangeRateTool = tool({
  description:
    "Look up the cached exchange rate from one currency to another. The app keeps rates in fx_rates with a 12h freshness window; this tool returns whatever the app would use for a conversion. Use this BEFORE asking the user for a rate — never ask the user 'what is the USD/NGN rate?', this tool already knows.",
  inputSchema: z.object({
    base: z.string().min(3).max(3).describe("Source currency, e.g. USD"),
    quote: z.string().min(3).max(3).describe("Target currency, e.g. NGN"),
  }),
  execute: async ({ base, quote }) => {
    const rate = await getRate(base.toUpperCase(), quote.toUpperCase());
    return {
      base: base.toUpperCase(),
      quote: quote.toUpperCase(),
      rate,
      summary: `1 ${base.toUpperCase()} = ${rate} ${quote.toUpperCase()}`,
    };
  },
});

const convertCurrencyTool = tool({
  description:
    "Convert an amount from one currency to another using the cached rate. Returns both the converted value and the rate used. Use this when the user gives an amount in currency A and you need the equivalent in currency B — e.g. they said 'log a $20 lunch' but the account is in NGN.",
  inputSchema: z.object({
    amount: z.number(),
    from: z.string().min(3).max(3),
    to: z.string().min(3).max(3),
  }),
  execute: async ({ amount, from, to }) => {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    const rate = await getRate(f, t);
    const converted = await convert(amount, f, t);
    return {
      amount,
      from: f,
      to: t,
      rate,
      converted,
      summary: `${amount} ${f} ≈ ${converted.toFixed(2)} ${t} (rate ${rate})`,
    };
  },
});

// ─── lookups (read-only, expanded) ──────────────────────────────────────

const listSavingsGoalsTool = tool({
  description:
    "List active savings goals (savings, net_worth, fire, debt_payoff). Use to find a goal id before commenting / updating, and to spot underfunded targets when reviewing.",
  inputSchema: z.object({}),
  execute: async () => {
    const rows = await listSavingsGoals();
    return {
      goals: rows.map((g) => ({
        id: g.id,
        kind: g.kind,
        name: g.name,
        currency: g.currency,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        monthlyContribution: g.monthlyContribution,
        horizonMonths: g.horizonMonths,
        accountId: g.accountId,
        notes: g.notes,
      })),
    };
  },
});

const listFlowsTool = tool({
  description:
    "List active recurring cash flows (income/expense). Use to find a flow id before commenting / updating, and to sanity-check whether the user has the inflows and outflows the conversation implies.",
  inputSchema: z.object({}),
  execute: async () => {
    const rows = await listFlows();
    return {
      flows: rows.map((f) => ({
        id: f.id,
        name: f.name,
        kind: f.kind,
        category: f.category,
        amount: f.amount,
        currency: f.currency,
        cadence: f.cadence,
        accountId: f.accountId,
        nextDueAt: f.nextDueAt,
        notes: f.notes,
      })),
    };
  },
});

const listDecisionsTool = tool({
  description:
    "List the user's decisions (open / decided / deferred). Open decisions are what the advisor anchors on — review these on every meaningful turn so advice stays specific.",
  inputSchema: z.object({
    onlyOpen: z.boolean().optional().describe("Default true — only return open."),
  }),
  execute: async ({ onlyOpen }) => {
    const rows = await listDecisions({ onlyOpen: onlyOpen ?? true });
    return {
      decisions: rows.map((d) => ({
        id: d.id,
        question: d.question,
        status: d.status,
        outcome: d.outcome,
        context: d.context,
      })),
    };
  },
});

const listGrantsTool = tool({
  description:
    "List equity grants (company, total/vested shares, strike, FMV, expected exit, currency).",
  inputSchema: z.object({}),
  execute: async () => {
    const rows = await listGrants();
    return {
      grants: rows.map((g) => ({
        id: g.id,
        company: g.company,
        grantType: g.grantType,
        totalShares: g.totalShares,
        vestedShares: g.vestedShares,
        strikePrice: g.strikePrice,
        fmvPerShare: g.fmvPerShare,
        exitPricePerShare: g.exitPricePerShare,
        currency: g.currency,
      })),
    };
  },
});

const listTransactionsTool = tool({
  description:
    "List recent transactions, optionally filtered by account, category, kind, or date range. Defaults to the most recent 50 across all accounts. Use when verifying user claims ('did I really spend that much on Food this month?') or when leaving a note tied to a specific tx.",
  inputSchema: z.object({
    accountId: z.number().int().positive().optional(),
    category: z.string().optional(),
    kind: z.enum(["income", "expense", "transfer"]).optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().positive().max(200).optional(),
  }),
  execute: async (input) => {
    const filter: TransactionFilter = {
      accountId: input.accountId,
      category: input.category,
      kind: input.kind,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      limit: input.limit ?? 50,
    };
    const rows = await listTransactions(filter);
    return {
      transactions: rows.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        destAccountId: t.destAccountId,
        kind: t.kind,
        amount: t.amount,
        currency: t.currency,
        category: t.category,
        occurredAt: t.occurredAt,
        notes: t.notes,
        flowId: t.flowId,
      })),
    };
  },
});

// ─── computed snapshots (proactive checks) ──────────────────────────────

const getNetWorthTool = tool({
  description:
    "Snapshot of the user's three-scenario net worth (floor / liquid / expected) in their base currency, broken down by category and currency. Use when the user asks 'where am I?' or before suggesting any allocation move.",
  inputSchema: z.object({}),
  execute: async () => {
    const baseCurrency = await getBaseCurrency();
    const summary = await computeNetWorth(baseCurrency);
    return {
      baseCurrency,
      totals: summary.totals,
      byCategory: summary.byCategory.floor,
      byCurrency: Object.fromEntries(
        Object.entries(summary.byCurrency.floor).map(([k, v]) => [
          k,
          { native: v.native, inBase: v.inBase },
        ]),
      ),
      hasData: summary.hasData,
    };
  },
});

const getRunwayCheckTool = tool({
  description:
    "ALARM-ENABLED runway check. Returns liquid cash, monthly burn, months of runway, and a severity flag. Severity: 'ok' if runway > 6 months OR income covers expenses; 'tight' if 3–6 months; 'critical' if < 3 months. CALL THIS PROACTIVELY at the start of any review-style turn — the user explicitly asked you to alarm them when they're going broke. If severity is 'critical', open the response with the warning before anything else.",
  inputSchema: z.object({}),
  execute: async () => {
    const baseCurrency = await getBaseCurrency();
    const runway = await computeCashRunway(baseCurrency);
    let severity: "ok" | "tight" | "critical" = "ok";
    const months = runway.monthsNetRunway ?? runway.monthsRunway ?? Infinity;
    if (months < 3) severity = "critical";
    else if (months < 6) severity = "tight";
    return {
      baseCurrency,
      liquidCash: runway.liquidCash,
      monthlyExpenses: runway.monthlyExpenses,
      monthlyIncome: runway.monthlyIncome,
      netMonthly: runway.netMonthly,
      monthsRunway: runway.monthsRunway,
      monthsNetRunway: runway.monthsNetRunway,
      severity,
      message:
        severity === "critical"
          ? `⚠️ Runway is ${months.toFixed(1)} months at current burn — call this out to the user.`
          : severity === "tight"
            ? `Runway is ${months.toFixed(1)} months — flag as something to watch.`
            : "Runway looks healthy.",
    };
  },
});

const getBudgetStatusTool = tool({
  description:
    "Per-budget month-to-date spend vs limit. Use to sanity-check before suggesting a discretionary purchase, or to flag categories that are about to blow past their cap.",
  inputSchema: z.object({}),
  execute: async () => {
    const baseCurrency = await getBaseCurrency();
    const summary = await computeBudgetStatus(baseCurrency);
    return {
      baseCurrency,
      totalLimit: summary.totalLimit,
      totalSpent: summary.totalSpent,
      overBudget: summary.overBudget.map((r) => ({
        id: r.id,
        category: r.category,
        spentThisMonth: r.spentThisMonth,
        monthlyLimit: r.monthlyLimit,
        percentUsed: r.percentUsed,
        currency: r.baseCurrency,
      })),
      rows: summary.rows.map((r) => ({
        id: r.id,
        category: r.category,
        spentThisMonth: r.spentThisMonth,
        monthlyLimit: r.monthlyLimit,
        percentUsed: r.percentUsed,
        currency: r.baseCurrency,
      })),
    };
  },
});

const getCashFlowTool = tool({
  description:
    "Monthly recurring inflows vs outflows in base currency, broken down by category. Use when reviewing the user's structural budget shape.",
  inputSchema: z.object({}),
  execute: async () => {
    const baseCurrency = await getBaseCurrency();
    const flow = await computeMonthlyCashFlow(baseCurrency);
    return {
      baseCurrency,
      income: flow.income,
      expenses: flow.expenses,
      net: flow.net,
      byCategory: flow.byCategory,
    };
  },
});

const getAccountBalancesTool = tool({
  description:
    "Effective balance for every active account (latest snapshot + signed transactions since). Returns native currency values; use convertCurrency if you need them in base.",
  inputSchema: z.object({}),
  execute: async () => {
    const accounts = await listAccountsWithEffective();
    return {
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        effectiveValue: a.effectiveValue,
        latestValue: a.latestValue,
        latestAsOf: a.latestAsOf,
      })),
    };
  },
});

// ─── proactive alerts surface ───────────────────────────────────────────

const listActiveAlertsTool = tool({
  description:
    "List active proactive alerts that the system has flagged for the user (runway, over-budget, off-pace goals). These are the same things the user sees on the /alerts page and as banners on the dashboard. Reference them in conversation so the user knows you're aware: 'I see your Food budget is 35% over this month — want me to help re-cap it?'",
  inputSchema: z.object({}),
  execute: async () => {
    const rows = await listActiveAlerts();
    return {
      alerts: rows.map((a) => ({
        id: a.id,
        kind: a.kind,
        severity: a.severity,
        title: a.title,
        body: a.body,
        actionUrl: a.actionUrl,
        contextJson: a.contextJson,
        createdAt: a.createdAt,
      })),
    };
  },
});

// ─── notes (cross-entity) ───────────────────────────────────────────────

const NOTE_ENTITIES = [
  "budget",
  "savingsGoal",
  "flow",
  "account",
  "transaction",
  "decision",
] as const;
type NoteEntity = (typeof NOTE_ENTITIES)[number];

const addNoteTool = tool({
  description:
    "Append a dated note to an existing entity (budget, savingsGoal, flow, account, transaction, or decision). Existing notes are preserved — the new note lands at the top with a [YYYY-MM-DD] prefix. Use this PROACTIVELY: when the user mentions context that would be useful next week ('I'll revisit this after the rent hits'), leave a note. When you spot a budget about to blow, leave a note on it. Decisions use the `context` field.",
  inputSchema: z.object({
    entity: z.enum(NOTE_ENTITIES),
    id: z.number().int().positive(),
    note: z.string().min(1),
  }),
  execute: async ({ entity, id, note }) => {
    const dated = `[${localToday()}] ${note.trim()}`;
    const updatedAtIso = new Date().toISOString();
    const result = await applyNote(entity, id, dated, updatedAtIso);
    if (!result.ok) return result;
    return {
      ok: true,
      entity,
      id,
      summary: `Noted on ${entity} #${id}: ${note.trim().slice(0, 80)}${note.length > 80 ? "…" : ""}`,
    };
  },
});

async function applyNote(
  entity: NoteEntity,
  id: number,
  dated: string,
  updatedAtIso: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (entity) {
    case "budget": {
      const [row] = await db
        .select({ notes: schema.budgets.notes })
        .from(schema.budgets)
        .where(eq(schema.budgets.id, id))
        .limit(1);
      if (!row) return { ok: false, error: `budget ${id} not found` };
      const next = row.notes ? `${dated}\n\n${row.notes}` : dated;
      await db
        .update(schema.budgets)
        .set({ notes: next, updatedAt: updatedAtIso })
        .where(eq(schema.budgets.id, id));
      return { ok: true };
    }
    case "savingsGoal": {
      const [row] = await db
        .select({ notes: schema.savingsGoals.notes })
        .from(schema.savingsGoals)
        .where(eq(schema.savingsGoals.id, id))
        .limit(1);
      if (!row) return { ok: false, error: `savingsGoal ${id} not found` };
      const next = row.notes ? `${dated}\n\n${row.notes}` : dated;
      await db
        .update(schema.savingsGoals)
        .set({ notes: next, updatedAt: updatedAtIso })
        .where(eq(schema.savingsGoals.id, id));
      return { ok: true };
    }
    case "flow": {
      const [row] = await db
        .select({ notes: schema.recurringFlows.notes })
        .from(schema.recurringFlows)
        .where(eq(schema.recurringFlows.id, id))
        .limit(1);
      if (!row) return { ok: false, error: `flow ${id} not found` };
      const next = row.notes ? `${dated}\n\n${row.notes}` : dated;
      await db
        .update(schema.recurringFlows)
        .set({ notes: next, updatedAt: updatedAtIso })
        .where(eq(schema.recurringFlows.id, id));
      return { ok: true };
    }
    case "account": {
      const [row] = await db
        .select({ notes: schema.accounts.notes })
        .from(schema.accounts)
        .where(eq(schema.accounts.id, id))
        .limit(1);
      if (!row) return { ok: false, error: `account ${id} not found` };
      const next = row.notes ? `${dated}\n\n${row.notes}` : dated;
      await db
        .update(schema.accounts)
        .set({ notes: next, updatedAt: updatedAtIso })
        .where(eq(schema.accounts.id, id));
      return { ok: true };
    }
    case "transaction": {
      const [row] = await db
        .select({ notes: schema.transactions.notes })
        .from(schema.transactions)
        .where(eq(schema.transactions.id, id))
        .limit(1);
      if (!row) return { ok: false, error: `transaction ${id} not found` };
      const next = row.notes ? `${dated}\n\n${row.notes}` : dated;
      await db
        .update(schema.transactions)
        .set({ notes: next, updatedAt: updatedAtIso })
        .where(eq(schema.transactions.id, id));
      return { ok: true };
    }
    case "decision": {
      // Decisions use `context` — there's no separate notes column on
      // this table. Same append shape; the field name is just different.
      const [row] = await db
        .select({ context: schema.decisions.context })
        .from(schema.decisions)
        .where(eq(schema.decisions.id, id))
        .limit(1);
      if (!row) return { ok: false, error: `decision ${id} not found` };
      const next = row.context ? `${dated}\n\n${row.context}` : dated;
      await db
        .update(schema.decisions)
        .set({ context: next, updatedAt: updatedAtIso })
        .where(eq(schema.decisions.id, id));
      return { ok: true };
    }
  }
}

// ─── updates (broader than budgets) ─────────────────────────────────────

const updateSavingsGoalTool = tool({
  description:
    "Update a savings goal — adjust monthly contribution, target, horizon, or archive it. Use after the user signals a change ('I can do 100k/mo now') or after you spot the goal is unreachable at the current pace.",
  inputSchema: z.object({
    goalId: z.number().int().positive(),
    monthlyContribution: z.number().nonnegative().optional(),
    targetAmount: z.number().positive().optional(),
    horizonMonths: z.number().int().positive().optional(),
    expectedReturnPct: z.number().min(0).max(20).optional(),
    archived: z.boolean().optional(),
  }),
  execute: async (input) => {
    const set: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (input.monthlyContribution != null)
      set.monthlyContribution = input.monthlyContribution;
    if (input.targetAmount != null) set.targetAmount = input.targetAmount;
    if (input.horizonMonths != null) set.horizonMonths = input.horizonMonths;
    if (input.expectedReturnPct != null)
      set.expectedReturnPct = input.expectedReturnPct;
    if (input.archived != null) set.archived = input.archived;
    await db
      .update(schema.savingsGoals)
      .set(set)
      .where(eq(schema.savingsGoals.id, input.goalId));
    return { ok: true };
  },
});

const updateFlowTool = tool({
  description:
    "Update a recurring flow — change amount, cadence, next-due date, category, or archive it. Useful for raises ('salary went from 2M to 2.4M'), bill changes, or pausing a flow.",
  inputSchema: z.object({
    flowId: z.number().int().positive(),
    amount: z.number().positive().optional(),
    cadence: z.enum(flowCadences).optional(),
    nextDueAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    category: z.string().optional(),
    archived: z.boolean().optional(),
  }),
  execute: async (input) => {
    const set: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (input.amount != null) set.amount = input.amount;
    if (input.cadence != null) set.cadence = input.cadence;
    if (input.nextDueAt != null) set.nextDueAt = input.nextDueAt;
    if (input.category != null) set.category = input.category;
    if (input.archived != null) set.archived = input.archived;
    await db
      .update(schema.recurringFlows)
      .set(set)
      .where(eq(schema.recurringFlows.id, input.flowId));
    return { ok: true };
  },
});

const decideDecisionTool = tool({
  description:
    "Close out (or defer) one of the user's decisions, optionally recording the outcome. Use when the conversation arrived at a clear conclusion the user agreed with.",
  inputSchema: z.object({
    decisionId: z.number().int().positive(),
    status: z.enum(["decided", "deferred"]),
    outcome: z.string().optional(),
  }),
  execute: async (input) => {
    await db
      .update(schema.decisions)
      .set({
        status: input.status,
        outcome: input.outcome ?? null,
        decidedAt: input.status === "decided" ? localToday() : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.decisions.id, input.decisionId));
    return { ok: true };
  },
});

export const advisorTools = {
  // Read
  listAccounts: listAccountsTool,
  listBudgets: listBudgetsTool,
  listSavingsGoals: listSavingsGoalsTool,
  listFlows: listFlowsTool,
  listDecisions: listDecisionsTool,
  listGrants: listGrantsTool,
  listTransactions: listTransactionsTool,
  // Computed
  getNetWorth: getNetWorthTool,
  getRunwayCheck: getRunwayCheckTool,
  getBudgetStatus: getBudgetStatusTool,
  getCashFlow: getCashFlowTool,
  getAccountBalances: getAccountBalancesTool,
  // FX (cached)
  getExchangeRate: getExchangeRateTool,
  convertCurrency: convertCurrencyTool,
  // Proactive surface
  listActiveAlerts: listActiveAlertsTool,
  // Write
  createTransaction: createTransactionTool,
  createBudget: createBudgetTool,
  updateBudget: updateBudgetTool,
  createFlow: createFlowTool,
  updateFlow: updateFlowTool,
  createSavingsGoal: createSavingsGoalTool,
  updateSavingsGoal: updateSavingsGoalTool,
  createAccount: createAccountTool,
  updateLoanTerms: updateLoanTermsTool,
  decideDecision: decideDecisionTool,
  addNote: addNoteTool,
};
