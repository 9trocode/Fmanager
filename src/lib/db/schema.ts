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
