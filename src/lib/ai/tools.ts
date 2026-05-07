import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { accountTypes, flowCadences, flowKinds } from "@/lib/db/schema";
import { listAccounts } from "@/lib/db/queries";
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

export const advisorTools = {
  listAccounts: listAccountsTool,
  listBudgets: listBudgetsTool,
  createTransaction: createTransactionTool,
  createBudget: createBudgetTool,
  updateBudget: updateBudgetTool,
  createFlow: createFlowTool,
  createSavingsGoal: createSavingsGoalTool,
  createAccount: createAccountTool,
  updateLoanTerms: updateLoanTermsTool,
};
