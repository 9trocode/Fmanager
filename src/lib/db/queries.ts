import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AccountType, TransactionKind } from "@/lib/db/schema";

export type SettingKey =
  | "base_currency"
  | "anthropic_api_key"
  | "openai_api_key"
  | "google_api_key"
  | "advisor_provider"
  | "advisor_model"
  | "onboarding_complete"
  | "fx_last_refresh"
  | "admin_email"
  | "admin_name"
  | "admin_password_hash";

const DEFAULTS: Partial<Record<SettingKey, string>> = {
  base_currency: "USD",
  advisor_model: "claude-sonnet-4-6",
};

export async function getSetting(key: SettingKey): Promise<string | null> {
  const row = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return row[0]?.value ?? DEFAULTS[key] ?? null;
}

export async function getSettings(
  keys: readonly SettingKey[],
): Promise<Record<string, string | null>> {
  if (keys.length === 0) return {};
  const rows = await db
    .select()
    .from(schema.settings)
    .where(inArray(schema.settings.key, keys as unknown as string[]));
  const map: Record<string, string | null> = {};
  for (const k of keys) map[k] = DEFAULTS[k] ?? null;
  for (const r of rows) if (r.value != null) map[r.key] = r.value;
  return map;
}

export async function setSetting(key: SettingKey, value: string | null) {
  if (value == null || value === "") {
    await db.delete(schema.settings).where(eq(schema.settings.key, key));
    return;
  }
  await db
    .insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date().toISOString() },
    });
}

/**
 * Per-request memo. Hit by every page that renders money — getting it
 * from one row in the settings table on every aggregation call adds up.
 */
export const getBaseCurrency = cache(async (): Promise<string> => {
  return (await getSetting("base_currency")) ?? "USD";
});

export async function listDecisions(opts: { onlyOpen?: boolean } = {}) {
  const where = opts.onlyOpen
    ? eq(schema.decisions.status, "open")
    : undefined;
  return db
    .select()
    .from(schema.decisions)
    .where(where)
    .orderBy(desc(schema.decisions.createdAt));
}

export async function getDecision(id: number) {
  const rows = await db
    .select()
    .from(schema.decisions)
    .where(eq(schema.decisions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAccounts(opts: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(schema.accounts)
    .where(opts.includeArchived ? undefined : eq(schema.accounts.archived, false))
    .orderBy(desc(schema.accounts.createdAt));
}

export async function getAccount(id: number) {
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestSnapshot(accountId: number) {
  const rows = await db
    .select()
    .from(schema.valueSnapshots)
    .where(eq(schema.valueSnapshots.accountId, accountId))
    .orderBy(desc(schema.valueSnapshots.asOf), desc(schema.valueSnapshots.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSnapshots(accountId: number) {
  return db
    .select()
    .from(schema.valueSnapshots)
    .where(eq(schema.valueSnapshots.accountId, accountId))
    .orderBy(desc(schema.valueSnapshots.asOf), desc(schema.valueSnapshots.id));
}

/**
 * Effective balance for an account = latest snapshot value
 * + sum of signed transaction amounts that occurred AFTER the snapshot's `asOf` date.
 *
 * Sign rules:
 *  - expense:  -amount on accountId
 *  - income:   +amount on accountId
 *  - transfer: -amount on accountId, +amount on destAccountId
 *
 * If no snapshot exists, the effective value is null (treated as no data).
 * If snapshot exists but no transactions, effective == latest.
 */
export async function getEffectiveBalance(accountId: number): Promise<{
  effectiveValue: number | null;
  latestValue: number | null;
  latestAsOf: string | null;
}> {
  const latest = await getLatestSnapshot(accountId);
  if (!latest) {
    return { effectiveValue: null, latestValue: null, latestAsOf: null };
  }

  // Outgoing transactions on this account after the snapshot.
  const outgoing = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.accountId, accountId),
        gte(schema.transactions.occurredAt, latest.asOf),
      ),
    );
  // Incoming transfers (this account as destination) after snapshot.
  const incoming = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.destAccountId, accountId),
        eq(schema.transactions.kind, "transfer"),
        gte(schema.transactions.occurredAt, latest.asOf),
      ),
    );

  let delta = 0;
  for (const t of outgoing) {
    // Skip transactions on the snapshot date itself; snapshot wins.
    if (t.occurredAt === latest.asOf) continue;
    if (t.kind === "expense" || t.kind === "transfer") delta -= t.amount;
    else if (t.kind === "income") delta += t.amount;
  }
  for (const t of incoming) {
    if (t.occurredAt === latest.asOf) continue;
    delta += t.amount;
  }

  return {
    effectiveValue: latest.value + delta,
    latestValue: latest.value,
    latestAsOf: latest.asOf,
  };
}

export async function listAccountsWithEffective(
  opts: { includeArchived?: boolean } = {},
) {
  const accounts = await listAccounts(opts);
  const result = await Promise.all(
    accounts.map(async (a) => {
      const eff = await getEffectiveBalance(a.id);
      return {
        ...a,
        effectiveValue: eff.effectiveValue,
        latestValue: eff.latestValue,
        latestAsOf: eff.latestAsOf,
      };
    }),
  );
  return result;
}

export async function listGrants() {
  return db
    .select()
    .from(schema.equityGrants)
    .orderBy(desc(schema.equityGrants.createdAt));
}

export async function getGrant(id: number) {
  const rows = await db
    .select()
    .from(schema.equityGrants)
    .where(eq(schema.equityGrants.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listFlows(opts: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(schema.recurringFlows)
    .where(
      opts.includeArchived
        ? undefined
        : eq(schema.recurringFlows.archived, false),
    )
    .orderBy(desc(schema.recurringFlows.createdAt));
}

export async function getFlow(id: number) {
  const rows = await db
    .select()
    .from(schema.recurringFlows)
    .where(eq(schema.recurringFlows.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Recurring flows that land in or are paid out of a specific account.
 * Active flows only by default — archived flows are excluded so the account
 * page doesn't suggest committed cash that isn't really committed anymore.
 */
export async function listAccountFlows(
  accountId: number,
  opts: { includeArchived?: boolean } = {},
) {
  return db
    .select()
    .from(schema.recurringFlows)
    .where(
      opts.includeArchived
        ? eq(schema.recurringFlows.accountId, accountId)
        : and(
            eq(schema.recurringFlows.accountId, accountId),
            eq(schema.recurringFlows.archived, false),
          ),
    )
    .orderBy(desc(schema.recurringFlows.createdAt));
}

export async function accountsByTypes(types: AccountType[]) {
  if (types.length === 0) return [];
  return db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.archived, false),
        inArray(schema.accounts.type, types),
      ),
    );
}

export async function listSavingsGoals(opts: { includeArchived?: boolean } = {}) {
  return db
    .select()
    .from(schema.savingsGoals)
    .where(
      opts.includeArchived
        ? undefined
        : eq(schema.savingsGoals.archived, false),
    )
    .orderBy(desc(schema.savingsGoals.createdAt));
}

export async function getSavingsGoal(id: number) {
  const rows = await db
    .select()
    .from(schema.savingsGoals)
    .where(eq(schema.savingsGoals.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type TransactionFilter = {
  accountId?: number;
  category?: string;
  kind?: TransactionKind;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  limit?: number;
};

export async function listTransactions(filter: TransactionFilter = {}) {
  const conditions = [];
  if (filter.accountId != null && Number.isFinite(filter.accountId)) {
    // Match either source or destination so transfers show on both sides.
    conditions.push(
      or(
        eq(schema.transactions.accountId, filter.accountId),
        eq(schema.transactions.destAccountId, filter.accountId),
      ),
    );
  }
  if (filter.category) {
    conditions.push(eq(schema.transactions.category, filter.category));
  }
  if (filter.kind) {
    conditions.push(eq(schema.transactions.kind, filter.kind));
  }
  if (filter.dateFrom) {
    conditions.push(gte(schema.transactions.occurredAt, filter.dateFrom));
  }
  if (filter.dateTo) {
    conditions.push(lte(schema.transactions.occurredAt, filter.dateTo));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const baseQuery = db
    .select()
    .from(schema.transactions)
    .where(where)
    .orderBy(desc(schema.transactions.occurredAt), desc(schema.transactions.id));

  if (filter.limit && filter.limit > 0) {
    return baseQuery.limit(filter.limit);
  }
  return baseQuery;
}

export async function getTransaction(id: number) {
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listTransactionCategories(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: schema.transactions.category })
    .from(schema.transactions)
    .orderBy(asc(schema.transactions.category));
  return rows
    .map((r) => r.category)
    .filter((c): c is string => Boolean(c && c.trim().length));
}

/**
 * Transactions touching this account, either as source or destination,
 * ordered most-recent first. For UI display in the account detail page.
 */
export async function listAccountTransactions(
  accountId: number,
  limit?: number,
) {
  const where = or(
    eq(schema.transactions.accountId, accountId),
    eq(schema.transactions.destAccountId, accountId),
  );
  const baseQuery = db
    .select()
    .from(schema.transactions)
    .where(where)
    .orderBy(desc(schema.transactions.occurredAt), desc(schema.transactions.id));
  if (limit && limit > 0) return baseQuery.limit(limit);
  return baseQuery;
}

/**
 * Transactions in the last `days` days. Used by the advisor system prompt.
 */
export async function listRecentTransactions(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().slice(0, 10);
  return db
    .select()
    .from(schema.transactions)
    .where(gte(schema.transactions.occurredAt, sinceIso))
    .orderBy(desc(schema.transactions.occurredAt), desc(schema.transactions.id));
}

/**
 * Latest N transactions across all accounts.
 */
export async function listLatestTransactions(limit = 10) {
  return db
    .select()
    .from(schema.transactions)
    .orderBy(desc(schema.transactions.occurredAt), desc(schema.transactions.id))
    .limit(limit);
}

/**
 * Transactions occurring on or between two ISO dates (inclusive).
 */
export async function listTransactionsBetween(
  startIso: string,
  endIso: string,
) {
  return db
    .select()
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.occurredAt, startIso),
        lte(schema.transactions.occurredAt, endIso),
      ),
    )
    .orderBy(desc(schema.transactions.occurredAt), desc(schema.transactions.id));
}

export async function listBudgets() {
  return db
    .select()
    .from(schema.budgets)
    .orderBy(asc(schema.budgets.category));
}

export async function getBudget(id: number) {
  const rows = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getBudgetByCategory(category: string, currency: string) {
  const rows = await db
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.category, category),
        eq(schema.budgets.currency, currency),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Re-export sql so other modules can build raw fragments if needed.
export { sql };
