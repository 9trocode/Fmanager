import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db, hostDb, schema } from "@/lib/db";
import { convert } from "@/lib/fx";
import { localToday } from "@/lib/dates";
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
  | "admin_password_hash"
  /**
   * Idle minutes before the in-app screen lock kicks in. "0" or
   * unset = disabled. Stored as a string in settings (everything
   * else is); the client parses to a number on load.
   */
  | "screen_lock_timeout_minutes"
  /**
   * Optional URL the panic button redirects to after logging out
   * — somewhere innocuous like google.com. Defaults to /login when
   * unset.
   */
  | "panic_redirect_url"
  /**
   * "1" allows anyone with a valid invite code to create an account
   * (default). "open" allows registration WITHOUT a code — useful
   * when admin trusts everyone who can reach the URL. Anything else
   * (including unset) means registration is closed.
   */
  | "registration_mode";

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
export async function getEffectiveBalance(
  accountId: number,
  /**
   * Upper bound for transaction inclusion. Defaults to today —
   * "current effective balance". Pass a YYYY-MM-DD to compute the
   * balance as of an arbitrary historical date (e.g. end of a past
   * month for the global month filter). The snapshot picked is
   * still the latest one at or before this date.
   */
  asOfDate?: string,
): Promise<{
  effectiveValue: number | null;
  latestValue: number | null;
  latestAsOf: string | null;
}> {
  const upperBound = asOfDate ?? localToday();
  // Latest snapshot AT OR BEFORE the upper bound. For asOfDate=today
  // this is the same as getLatestSnapshot; for past dates it picks
  // whatever snapshot was current then.
  const snapRows = await db
    .select()
    .from(schema.valueSnapshots)
    .where(
      and(
        eq(schema.valueSnapshots.accountId, accountId),
        lte(schema.valueSnapshots.asOf, upperBound),
      ),
    )
    .orderBy(
      desc(schema.valueSnapshots.asOf),
      desc(schema.valueSnapshots.id),
    )
    .limit(1);
  const latest = snapRows[0] ?? null;
  if (!latest) {
    return { effectiveValue: null, latestValue: null, latestAsOf: null };
  }
  // The snapshot's currency is the account's currency for balance
  // purposes. Transactions in OTHER currencies (e.g. an NGN flow
  // mistakenly linked to a USD account) need to be FX-converted
  // before they can be summed into the same number.
  const account = await getAccount(accountId);
  const accountCurrency = account?.currency ?? latest.currency;

  // One query covers both directions: source-on-account OR
  // destination-on-account-for-transfers, after the snapshot. Halves
  // the round-trips vs. the previous two-query version.
  //
  // The upper bound (occurredAt <= upperBound) excludes transactions
  // dated AFTER the as-of date. For asOfDate=today this is the
  // future-dated guard from before; for past dates it's the
  // historical-cutoff that makes "balance as at end of March" mean
  // what it should mean.
  const txs = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.occurredAt, latest.asOf),
        lte(schema.transactions.occurredAt, upperBound),
        or(
          eq(schema.transactions.accountId, accountId),
          and(
            eq(schema.transactions.destAccountId, accountId),
            eq(schema.transactions.kind, "transfer"),
          ),
        ),
      ),
    );

  let delta = 0;
  for (const t of txs) {
    // Skip transactions on the snapshot date itself; snapshot wins.
    if (t.occurredAt === latest.asOf) continue;
    // FX-convert into the account's currency. No-op if currencies
    // already match (convert short-circuits on from === to).
    const amountInAccountCcy = await convert(
      t.amount,
      t.currency,
      accountCurrency,
    );
    if (t.accountId === accountId) {
      if (t.kind === "expense" || t.kind === "transfer") delta -= amountInAccountCcy;
      else if (t.kind === "income") delta += amountInAccountCcy;
    }
    if (t.destAccountId === accountId && t.kind === "transfer") {
      delta += amountInAccountCcy;
    }
  }

  return {
    effectiveValue: latest.value + delta,
    latestValue: latest.value,
    latestAsOf: latest.asOf,
  };
}

/**
 * Effective balance for every account in one shot.
 *
 * The naive version called `getEffectiveBalance(id)` per account, each
 * of which fired 3 queries (latest snapshot + outgoing tx + incoming
 * tx). For 10 accounts that's 31 queries.
 *
 * This batches into 3 queries total regardless of N:
 *   1. accounts list
 *   2. one window-function query for the latest snapshot per account
 *   3. all post-snapshot transactions in one scan, grouped in memory
 */
export async function listAccountsWithEffective(
  opts: { includeArchived?: boolean; asOfDate?: string } = {},
) {
  const accounts = await listAccounts(opts);
  if (accounts.length === 0) return [];

  const ids = accounts.map((a) => a.id);
  const upperBound = opts.asOfDate ?? localToday();

  // Latest snapshot per account at or before upperBound. Subquery
  // bounds asOf by upperBound so a "view as of last March" picks
  // the snapshot that was current then, not today's. The
  // (account_id, as_of) composite index makes this a b-tree walk
  // per account, not a scan.
  const latestSnapshots = await db
    .select()
    .from(schema.valueSnapshots)
    .where(
      and(
        inArray(schema.valueSnapshots.accountId, ids),
        lte(schema.valueSnapshots.asOf, upperBound),
        sql`(${schema.valueSnapshots.accountId}, ${schema.valueSnapshots.asOf}, ${schema.valueSnapshots.id}) IN (
          SELECT account_id, MAX(as_of), MAX(id)
          FROM value_snapshots
          WHERE account_id IN ${ids}
            AND as_of <= ${upperBound}
          GROUP BY account_id, as_of
        )`,
      ),
    );
  const latestByAccount = new Map(
    latestSnapshots.map((s) => [s.accountId, s]),
  );

  // Earliest snapshot date across the set — used as the lower bound
  // for the transactions scan so we don't pull years of unneeded rows
  // when an old account has a stale snapshot.
  const earliestAsOf = latestSnapshots.reduce<string>((acc, s) => {
    return acc === "" || s.asOf < acc ? s.asOf : acc;
  }, "");

  // All transactions touching any of these accounts since the earliest
  // relevant snapshot AND on/before the as-of date. For asOfDate=today
  // (default) this excludes future-dated intent rows; for past dates
  // it's the historical cutoff that makes "balance as at end of March"
  // mean what it should mean.
  const txs = earliestAsOf
    ? await db
        .select()
        .from(schema.transactions)
        .where(
          and(
            or(
              inArray(schema.transactions.accountId, ids),
              inArray(schema.transactions.destAccountId, ids),
            ),
            gte(schema.transactions.occurredAt, earliestAsOf),
            lte(schema.transactions.occurredAt, upperBound),
          ),
        )
    : [];

  // Build the per-account result. Cross-currency transactions
  // (e.g. an NGN flow linked to a USD account) get FX-converted
  // into the account's currency before summing — without this,
  // a -₦70k transaction on a USD account naively subtracted
  // 70,000 from the USD balance, producing -$70,000.
  const result = await Promise.all(
    accounts.map(async (a) => {
      const latest = latestByAccount.get(a.id);
      if (!latest) {
        return {
          ...a,
          effectiveValue: null as number | null,
          latestValue: null as number | null,
          latestAsOf: null as string | null,
        };
      }
      let delta = 0;
      for (const t of txs) {
        // Skip transactions on the snapshot date itself; snapshot wins.
        if (t.occurredAt === latest.asOf) continue;
        if (t.occurredAt < latest.asOf) continue;
        const isSource = t.accountId === a.id;
        const isDest = t.destAccountId === a.id && t.kind === "transfer";
        if (!isSource && !isDest) continue;
        const amountInAccountCcy = await convert(
          t.amount,
          t.currency,
          a.currency,
        );
        if (isSource) {
          if (t.kind === "expense" || t.kind === "transfer")
            delta -= amountInAccountCcy;
          else if (t.kind === "income") delta += amountInAccountCcy;
        }
        if (isDest) {
          delta += amountInAccountCcy;
        }
      }
      return {
        ...a,
        effectiveValue: latest.value + delta,
        latestValue: latest.value,
        latestAsOf: latest.asOf,
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
 *
 * Local-time bounds — `toISOString().slice(0,10)` would skew by a day
 * for users in non-UTC zones near midnight, dropping yesterday's
 * transactions out of "recent" or pulling tomorrow's in.
 */
export async function listRecentTransactions(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const y = since.getFullYear();
  const m = String(since.getMonth() + 1).padStart(2, "0");
  const d = String(since.getDate()).padStart(2, "0");
  const sinceLocal = `${y}-${m}-${d}`;
  return db
    .select()
    .from(schema.transactions)
    .where(gte(schema.transactions.occurredAt, sinceLocal))
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
