import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: updatedAt(),
});
