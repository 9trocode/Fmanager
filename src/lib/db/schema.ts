import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`);
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`);

export const accountTypes = [
  "cash",
  "brokerage",
  "crypto",
  "real_estate",
  "equity",
  "retirement",
  "loan",
  "other",
] as const;
export type AccountType = (typeof accountTypes)[number];

export const accounts = sqliteTable("accounts", {
  id: id(),
  name: text("name").notNull(),
  type: text("type", { enum: accountTypes }).notNull(),
  currency: text("currency").notNull(),
  institution: text("institution"),
  notes: text("notes"),
  // Optional account-detail fields. All free-text, all optional.
  // Stored locally — anyone with disk access can read these. Use disk encryption
  // if you put sensitive numbers here.
  accountNumber: text("account_number"),
  routingOrIban: text("routing_or_iban"),
  swiftBic: text("swift_bic"),
  holderName: text("holder_name"),
  branch: text("branch"),
  loginUrl: text("login_url"),
  contactPhone: text("contact_phone"),
  statementsUrl: text("statements_url"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const valueSnapshots = sqliteTable("value_snapshots", {
  id: id(),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  value: real("value").notNull(),
  currency: text("currency").notNull(),
  asOf: text("as_of").notNull(),
  source: text("source").notNull().default("manual"),
  createdAt: createdAt(),
});

export const equityGrants = sqliteTable("equity_grants", {
  id: id(),
  accountId: integer("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  company: text("company").notNull(),
  grantType: text("grant_type", {
    enum: ["iso", "nso", "rsu", "founder_shares", "safe", "other"],
  })
    .notNull()
    .default("nso"),
  totalShares: real("total_shares").notNull(),
  vestedShares: real("vested_shares").notNull().default(0),
  strikePrice: real("strike_price"),
  currency: text("currency").notNull().default("USD"),
  fmvPerShare: real("fmv_per_share"),
  exitPricePerShare: real("exit_price_per_share"),
  vestingStartDate: text("vesting_start_date"),
  vestingMonths: integer("vesting_months").default(48),
  cliffMonths: integer("cliff_months").default(12),
  expectedExitMonths: integer("expected_exit_months"),
  taxRatePct: real("tax_rate_pct"),
  vestingNotes: text("vesting_notes"),
  grantedAt: text("granted_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const fxRates = sqliteTable("fx_rates", {
  id: id(),
  base: text("base").notNull(),
  quote: text("quote").notNull(),
  rate: real("rate").notNull(),
  fetchedAt: text("fetched_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export const decisions = sqliteTable("decisions", {
  id: id(),
  question: text("question").notNull(),
  context: text("context"),
  status: text("status", { enum: ["open", "decided", "deferred"] })
    .notNull()
    .default("open"),
  decidedAt: text("decided_at"),
  outcome: text("outcome"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const flowCadences = ["weekly", "monthly", "yearly"] as const;
export type FlowCadence = (typeof flowCadences)[number];

export const flowKinds = ["income", "expense"] as const;
export type FlowKind = (typeof flowKinds)[number];

export const recurringFlows = sqliteTable("recurring_flows", {
  id: id(),
  name: text("name").notNull(),
  kind: text("kind", { enum: flowKinds }).notNull(),
  category: text("category"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull(),
  cadence: text("cadence", { enum: flowCadences }).notNull().default("monthly"),
  /**
   * Account the cash flows from (kind=expense) or to (kind=income).
   * Optional for back-compat with existing rows. New entries should require it.
   */
  accountId: integer("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  /**
   * Last calendar period (`YYYY-MM-DD`) for which an auto-accrued
   * transaction has already been posted. Drives `accrueDueFlows()` so a
   * monthly salary turns into a real transaction on the linked account
   * once each month has elapsed — making net worth actually reflect the
   * recurring inflow instead of it being a "plan" that never materialises.
   *
   * Null means the flow has never been accrued. New flows are seeded with
   * the period boundary at creation time so the first accrual fires after
   * one full cadence has passed (no surprise back-dated transactions).
   */
  lastPostedAt: text("last_posted_at"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: updatedAt(),
});

export const transactionKinds = ["expense", "income", "transfer"] as const;
export type TransactionKind = (typeof transactionKinds)[number];

export const goalKinds = [
  "savings",
  "net_worth",
  "fire",
  "debt_payoff",
] as const;
export type GoalKind = (typeof goalKinds)[number];

/**
 * Unified goals table (originally `savings_goals`; kept that table name for
 * back-compat). Each row represents one of four kinds:
 *
 *  - savings:     Save toward target via monthly contribution. Manual current.
 *  - net_worth:   Reach a target total net worth. Current = computed (floor).
 *  - fire:        Financial independence. Target = computed (annual_expenses ×
 *                 fireMultiplier). Current = computed (floor net worth).
 *  - debt_payoff: Drive a linked loan account's balance to zero. Current =
 *                 effective balance of that account.
 */
export const savingsGoals = sqliteTable("savings_goals", {
  id: id(),
  kind: text("kind", { enum: goalKinds }).notNull().default("savings"),
  name: text("name").notNull(),
  category: text("category"),
  targetAmount: real("target_amount"),
  currentAmount: real("current_amount").notNull().default(0),
  currency: text("currency").notNull(),
  monthlyContribution: real("monthly_contribution").notNull().default(0),
  expectedReturnPct: real("expected_return_pct").notNull().default(0),
  horizonMonths: integer("horizon_months").notNull().default(12),
  /** Optional explicit target date (ISO YYYY-MM-DD). If null, horizonMonths is used. */
  targetDate: text("target_date"),
  /** Multiplier for FIRE kind (default 25 = 4% rule). */
  fireMultiplier: real("fire_multiplier"),
  startedAt: text("started_at").notNull(),
  accountId: integer("account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  notes: text("notes"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    category: text("category").notNull(),
    monthlyLimit: real("monthly_limit").notNull(),
    currency: text("currency").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniqueCategoryCurrency: uniqueIndex("budgets_category_currency").on(
      t.category,
      t.currency,
    ),
  }),
);

export const transactions = sqliteTable("transactions", {
  id: id(),
  accountId: integer("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  // For transfers: optional destination account
  destAccountId: integer("dest_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }),
  kind: text("kind", { enum: transactionKinds }).notNull(),
  amount: real("amount").notNull(), // always positive; sign comes from kind
  currency: text("currency").notNull(),
  category: text("category"), // free-text; reuse the same suggestions as flows (lib/flows.ts)
  occurredAt: text("occurred_at").notNull(), // ISO date YYYY-MM-DD
  notes: text("notes"),
  flowId: integer("flow_id").references(() => recurringFlows.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * Advisor chat history. Sessions are independent threads; messages are
 * the full UIMessage v6 shape persisted as JSON so we round-trip text,
 * file attachments, and tool-call parts without a column-per-part-type
 * schema. Messages cascade on session delete.
 */
export const chatSessions = sqliteTable("chat_sessions", {
  id: id(),
  title: text("title").notNull().default("New conversation"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: id(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => chatSessions.id, { onDelete: "cascade" }),
  // Stable client id (UIMessage.id) so re-sends from useChat dedupe
  // against existing rows instead of inserting duplicates.
  clientId: text("client_id").notNull(),
  role: text("role").notNull(),
  /** JSON-serialised full UIMessage (text/file/tool parts). */
  uiJson: text("ui_json").notNull(),
  createdAt: createdAt(),
});
