import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getOwner, ownedBy } from "@/lib/db/scope";
import { convert, prefetchRates } from "@/lib/fx";
import { localToday } from "@/lib/dates";
import type { AccountType, TransactionKind } from "@/lib/db/schema";
import {
  destinationTransferDelta,
  sourceTransactionDelta,
} from "@/lib/account-types";

/**
 * Settings come in three flavors:
 *
 *  • SCOPED: per-tenant config that isolated users override on a
 *    per-row basis. Host (settings-admin + shared users) keeps using
 *    the global `settings` table; isolated users get their own row in
 *    `user_settings`. Examples: base currency, AI keys, advisor
 *    model, screen-lock timeout, panic URL.
 *
 *  • HOST: instance-wide config the host owns. Authentication and
 *    registration policy live here — these have no per-tenant meaning.
 *    Examples: admin_email, admin_password_hash, registration_mode.
 *    Routed via `hostDb` from `auth/session.ts` and
 *    `actions/members.ts` directly, not through `getSetting()`.
 *
 *  • GLOBAL: read-only-ish shared resources. Everyone reads them but
 *    only the host writes. Example: fx_last_refresh.
 */
const SCOPED_KEYS = [
  "base_currency",
  "anthropic_api_key",
  "openai_api_key",
  "google_api_key",
  "advisor_provider",
  "advisor_model",
  "onboarding_complete",
  "screen_lock_timeout_minutes",
  "panic_redirect_url",
] as const;
type ScopedKey = (typeof SCOPED_KEYS)[number];

const GLOBAL_KEYS = ["fx_last_refresh"] as const;
type GlobalKey = (typeof GLOBAL_KEYS)[number];

// Public union — kept for back-compat with callers that already type
// against this. Includes host keys for the few legacy callers; new
// code should reach for hostDb directly when touching host config.
export type SettingKey =
  | ScopedKey
  | GlobalKey
  | "admin_email"
  | "admin_name"
  | "admin_password_hash"
  | "registration_mode";

function isScopedKey(key: SettingKey): key is ScopedKey {
  return (SCOPED_KEYS as readonly string[]).includes(key);
}

const DEFAULTS: Partial<Record<SettingKey, string>> = {
  base_currency: "USD",
  advisor_model: "claude-sonnet-4-6",
};

/**
 * Read a setting value with scope resolution.
 *
 *   • Scoped key + isolated user → user_settings row, then DEFAULTS
 *     constant. NEVER falls through to the host's `settings` table —
 *     that would leak the host's API keys, advisor model, currency,
 *     etc. into every tenant. Each tenant configures their own.
 *   • Anything else (host / shared user / non-scoped key) → global
 *     `settings` row, then DEFAULTS.
 *
 * The strict-isolation policy is what makes "host for others" safe:
 * an isolated tenant who hasn't entered an API key gets `null`, not
 * the host's key. Sensible values like base_currency=USD come from
 * the DEFAULTS map so tenants aren't staring at empty UI on day 1.
 */
export async function getSetting(key: SettingKey): Promise<string | null> {
  if (isScopedKey(key)) {
    const owner = await getOwner();
    if (owner != null) {
      const userRow = await db
        .select()
        .from(schema.userSettings)
        .where(
          and(
            eq(schema.userSettings.userId, owner),
            eq(schema.userSettings.key, key),
          ),
        )
        .limit(1);
      if (userRow[0]) {
        return userRow[0].value ?? null;
      }
      // Strict isolation — no host-table fallback for tenants.
      return DEFAULTS[key] ?? null;
    }
  }
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
  const map: Record<string, string | null> = {};
  for (const k of keys) map[k] = DEFAULTS[k] ?? null;

  const owner = await getOwner();
  const isIsolated = owner != null;

  if (isIsolated) {
    // Isolated tenants: scoped keys come strictly from user_settings
    // (or DEFAULTS). Non-scoped keys still go to the global table —
    // those are either host-only (already filtered before getting
    // here) or shared globals like fx_last_refresh.
    const scopedNeeded = keys.filter(isScopedKey);
    if (scopedNeeded.length > 0) {
      const userRows = await db
        .select()
        .from(schema.userSettings)
        .where(
          and(
            eq(schema.userSettings.userId, owner),
            inArray(
              schema.userSettings.key,
              scopedNeeded as unknown as string[],
            ),
          ),
        );
      for (const r of userRows) map[r.key] = r.value;
    }
    const globalNeeded = keys.filter((k) => !isScopedKey(k));
    if (globalNeeded.length > 0) {
      const rows = await db
        .select()
        .from(schema.settings)
        .where(
          inArray(schema.settings.key, globalNeeded as unknown as string[]),
        );
      for (const r of rows) if (r.value != null) map[r.key] = r.value;
    }
    return map;
  }

  // Host / shared user: every key reads the global table.
  const rows = await db
    .select()
    .from(schema.settings)
    .where(inArray(schema.settings.key, keys as unknown as string[]));
  for (const r of rows) if (r.value != null) map[r.key] = r.value;
  return map;
}

/**
 * Write a setting. Scoped keys land in user_settings for isolated
 * tenants; everything else (and host/shared sessions) writes to the
 * global `settings` table.
 */
export async function setSetting(key: SettingKey, value: string | null) {
  if (isScopedKey(key)) {
    const owner = await getOwner();
    if (owner != null) {
      if (value == null || value === "") {
        await db
          .delete(schema.userSettings)
          .where(
            and(
              eq(schema.userSettings.userId, owner),
              eq(schema.userSettings.key, key),
            ),
          );
        return;
      }
      await db
        .insert(schema.userSettings)
        .values({ userId: owner, key, value })
        .onConflictDoUpdate({
          target: [schema.userSettings.userId, schema.userSettings.key],
          set: { value, updatedAt: new Date().toISOString() },
        });
      return;
    }
  }
  // Global path: host settings table.
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
  const owner = await getOwner();
  const where = opts.onlyOpen
    ? and(
        eq(schema.decisions.status, "open"),
        ownedBy(schema.decisions.ownerUserId, owner),
      )
    : ownedBy(schema.decisions.ownerUserId, owner);
  return db
    .select()
    .from(schema.decisions)
    .where(where)
    .orderBy(desc(schema.decisions.createdAt));
}

export async function getDecision(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.decisions)
    .where(
      and(
        eq(schema.decisions.id, id),
        ownedBy(schema.decisions.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listAccounts(opts: { includeArchived?: boolean } = {}) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.accounts)
    .where(
      opts.includeArchived
        ? ownedBy(schema.accounts.ownerUserId, owner)
        : and(
            eq(schema.accounts.archived, false),
            ownedBy(schema.accounts.ownerUserId, owner),
          ),
    )
    .orderBy(desc(schema.accounts.createdAt));
}

export async function getAccount(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.id, id),
        ownedBy(schema.accounts.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestSnapshot(accountId: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.valueSnapshots)
    .where(
      and(
        eq(schema.valueSnapshots.accountId, accountId),
        ownedBy(schema.valueSnapshots.ownerUserId, owner),
      ),
    )
    .orderBy(desc(schema.valueSnapshots.asOf), desc(schema.valueSnapshots.id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSnapshots(accountId: number) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.valueSnapshots)
    .where(
      and(
        eq(schema.valueSnapshots.accountId, accountId),
        ownedBy(schema.valueSnapshots.ownerUserId, owner),
      ),
    )
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
  const owner = await getOwner();
  const snapRows = await db
    .select()
    .from(schema.valueSnapshots)
    .where(
      and(
        eq(schema.valueSnapshots.accountId, accountId),
        lte(schema.valueSnapshots.asOf, upperBound),
        ownedBy(schema.valueSnapshots.ownerUserId, owner),
      ),
    )
    .orderBy(desc(schema.valueSnapshots.asOf), desc(schema.valueSnapshots.id))
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
        ownedBy(schema.transactions.ownerUserId, owner),
      ),
    );

  // Prefetch every (txCcy → accountCcy) rate so the loop is sync.
  // Was per-tx awaited convert() — sequential despite the cache.
  const rates = await prefetchRates(
    txs.map((t) => [t.currency, accountCurrency] as const),
  );
  let delta = 0;
  for (const t of txs) {
    if (t.occurredAt === latest.asOf) continue;
    const amountInAccountCcy =
      t.currency === accountCurrency
        ? t.amount
        : rates.convert(t.amount, t.currency, accountCurrency);
    if (t.accountId === accountId) {
      delta += sourceTransactionDelta(
        account?.type ?? "other",
        t.kind,
        amountInAccountCcy,
      );
    }
    if (t.destAccountId === accountId && t.kind === "transfer") {
      delta += destinationTransferDelta(
        account?.type ?? "other",
        amountInAccountCcy,
      );
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
  const owner = await getOwner();

  // Snapshots are scoped via the parent account list (ids belong only
  // to the active owner). Belt-and-braces: keep the column filter too.
  const latestSnapshots = await db
    .select()
    .from(schema.valueSnapshots)
    .where(
      and(
        inArray(schema.valueSnapshots.accountId, ids),
        lte(schema.valueSnapshots.asOf, upperBound),
        ownedBy(schema.valueSnapshots.ownerUserId, owner),
        sql`(${schema.valueSnapshots.accountId}, ${schema.valueSnapshots.asOf}, ${schema.valueSnapshots.id}) IN (
          SELECT account_id, MAX(as_of), MAX(id)
          FROM value_snapshots
          WHERE account_id IN ${ids}
            AND as_of <= ${upperBound}
          GROUP BY account_id, as_of
        )`,
      ),
    );
  const latestByAccount = new Map(latestSnapshots.map((s) => [s.accountId, s]));

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
            ownedBy(schema.transactions.ownerUserId, owner),
          ),
        )
    : [];

  // Cross-currency transactions get FX-converted into the account's
  // currency before summing. Was: per-tx awaited convert() inside the
  // outer Promise.all over accounts — sequential despite the surface
  // parallelism (each inner await yields, then the next). At 10
  // accounts × 50 mixed-currency txs that's 500 sequential awaits
  // even with the 12h cache.
  //
  // Now: prefetch every (txCcy → accountCcy) pair we'll need into one
  // RateMap, then synchronous in-memory math. The Promise.all + inner
  // for-loop becomes a plain map.
  const ratePairs: Array<readonly [string, string]> = [];
  for (const a of accounts) {
    for (const t of txs) {
      if (t.accountId === a.id || t.destAccountId === a.id) {
        ratePairs.push([t.currency, a.currency]);
      }
    }
  }
  const rates = await prefetchRates(ratePairs);

  return accounts.map((a) => {
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
      if (t.occurredAt === latest.asOf) continue;
      if (t.occurredAt < latest.asOf) continue;
      const isSource = t.accountId === a.id;
      const isDest = t.destAccountId === a.id && t.kind === "transfer";
      if (!isSource && !isDest) continue;
      const amountInAccountCcy =
        t.currency === a.currency
          ? t.amount
          : rates.convert(t.amount, t.currency, a.currency);
      if (isSource) {
        delta += sourceTransactionDelta(a.type, t.kind, amountInAccountCcy);
      }
      if (isDest) {
        delta += destinationTransferDelta(a.type, amountInAccountCcy);
      }
    }
    return {
      ...a,
      effectiveValue: latest.value + delta,
      latestValue: latest.value,
      latestAsOf: latest.asOf,
    };
  });
}

export async function listGrants() {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.equityGrants)
    .where(ownedBy(schema.equityGrants.ownerUserId, owner))
    .orderBy(desc(schema.equityGrants.createdAt));
}

export async function getGrant(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.equityGrants)
    .where(
      and(
        eq(schema.equityGrants.id, id),
        ownedBy(schema.equityGrants.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listFlows(opts: { includeArchived?: boolean } = {}) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.recurringFlows)
    .where(
      opts.includeArchived
        ? ownedBy(schema.recurringFlows.ownerUserId, owner)
        : and(
            eq(schema.recurringFlows.archived, false),
            ownedBy(schema.recurringFlows.ownerUserId, owner),
          ),
    )
    .orderBy(desc(schema.recurringFlows.createdAt));
}

export async function getFlow(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.recurringFlows)
    .where(
      and(
        eq(schema.recurringFlows.id, id),
        ownedBy(schema.recurringFlows.ownerUserId, owner),
      ),
    )
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
  const owner = await getOwner();
  return db
    .select()
    .from(schema.recurringFlows)
    .where(
      opts.includeArchived
        ? and(
            eq(schema.recurringFlows.accountId, accountId),
            ownedBy(schema.recurringFlows.ownerUserId, owner),
          )
        : and(
            eq(schema.recurringFlows.accountId, accountId),
            eq(schema.recurringFlows.archived, false),
            ownedBy(schema.recurringFlows.ownerUserId, owner),
          ),
    )
    .orderBy(desc(schema.recurringFlows.createdAt));
}

export async function accountsByTypes(types: AccountType[]) {
  if (types.length === 0) return [];
  const owner = await getOwner();
  return db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.archived, false),
        inArray(schema.accounts.type, types),
        ownedBy(schema.accounts.ownerUserId, owner),
      ),
    );
}

export async function listSavingsGoals(
  opts: { includeArchived?: boolean } = {},
) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.savingsGoals)
    .where(
      opts.includeArchived
        ? ownedBy(schema.savingsGoals.ownerUserId, owner)
        : and(
            eq(schema.savingsGoals.archived, false),
            ownedBy(schema.savingsGoals.ownerUserId, owner),
          ),
    )
    .orderBy(desc(schema.savingsGoals.createdAt));
}

export async function getSavingsGoal(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.savingsGoals)
    .where(
      and(
        eq(schema.savingsGoals.id, id),
        ownedBy(schema.savingsGoals.ownerUserId, owner),
      ),
    )
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
  const owner = await getOwner();
  const conditions = [ownedBy(schema.transactions.ownerUserId, owner)];
  if (filter.accountId != null && Number.isFinite(filter.accountId)) {
    conditions.push(
      or(
        eq(schema.transactions.accountId, filter.accountId),
        eq(schema.transactions.destAccountId, filter.accountId),
      )!,
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

  const baseQuery = db
    .select()
    .from(schema.transactions)
    .where(and(...conditions))
    .orderBy(
      desc(schema.transactions.occurredAt),
      desc(schema.transactions.id),
    );

  if (filter.limit && filter.limit > 0) {
    return baseQuery.limit(filter.limit);
  }
  return baseQuery;
}

export async function getTransaction(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.transactions)
    .where(
      and(
        eq(schema.transactions.id, id),
        ownedBy(schema.transactions.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listTransactionCategories(): Promise<string[]> {
  const owner = await getOwner();
  const rows = await db
    .selectDistinct({ category: schema.transactions.category })
    .from(schema.transactions)
    .where(ownedBy(schema.transactions.ownerUserId, owner))
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
  const owner = await getOwner();
  const where = and(
    or(
      eq(schema.transactions.accountId, accountId),
      eq(schema.transactions.destAccountId, accountId),
    ),
    ownedBy(schema.transactions.ownerUserId, owner),
  );
  const baseQuery = db
    .select()
    .from(schema.transactions)
    .where(where)
    .orderBy(
      desc(schema.transactions.occurredAt),
      desc(schema.transactions.id),
    );
  if (limit && limit > 0) return baseQuery.limit(limit);
  return baseQuery;
}

/**
 * Transactions in the last `days` days. Used by the advisor system prompt.
 */
export async function listRecentTransactions(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const y = since.getFullYear();
  const m = String(since.getMonth() + 1).padStart(2, "0");
  const d = String(since.getDate()).padStart(2, "0");
  const sinceLocal = `${y}-${m}-${d}`;
  const owner = await getOwner();
  return db
    .select()
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.occurredAt, sinceLocal),
        ownedBy(schema.transactions.ownerUserId, owner),
      ),
    )
    .orderBy(
      desc(schema.transactions.occurredAt),
      desc(schema.transactions.id),
    );
}

/**
 * Latest N transactions across all accounts.
 */
export async function listLatestTransactions(limit = 10) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.transactions)
    .where(ownedBy(schema.transactions.ownerUserId, owner))
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
  const owner = await getOwner();
  return db
    .select()
    .from(schema.transactions)
    .where(
      and(
        gte(schema.transactions.occurredAt, startIso),
        lte(schema.transactions.occurredAt, endIso),
        ownedBy(schema.transactions.ownerUserId, owner),
      ),
    )
    .orderBy(
      desc(schema.transactions.occurredAt),
      desc(schema.transactions.id),
    );
}

export async function listBudgets() {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.budgets)
    .where(ownedBy(schema.budgets.ownerUserId, owner))
    .orderBy(asc(schema.budgets.category));
}

export async function listDebtPlans(opts: { includeInactive?: boolean } = {}) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.debtPlans)
    .where(
      opts.includeInactive
        ? ownedBy(schema.debtPlans.ownerUserId, owner)
        : and(
            eq(schema.debtPlans.active, true),
            ownedBy(schema.debtPlans.ownerUserId, owner),
          ),
    )
    .orderBy(asc(schema.debtPlans.nextPaymentDate));
}

export async function getDebtPlan(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.debtPlans)
    .where(
      and(
        eq(schema.debtPlans.id, id),
        ownedBy(schema.debtPlans.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getDebtPlanByLoanAccount(loanAccountId: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.debtPlans)
    .where(
      and(
        eq(schema.debtPlans.loanAccountId, loanAccountId),
        ownedBy(schema.debtPlans.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getDebtPlanBySourceAccount(sourceAccountId: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.debtPlans)
    .where(
      and(
        eq(schema.debtPlans.sourceAccountId, sourceAccountId),
        ownedBy(schema.debtPlans.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getDebtPayment(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.debtPayments)
    .where(
      and(
        eq(schema.debtPayments.id, id),
        ownedBy(schema.debtPayments.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listDebtPayments(planId: number, limit = 12) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.debtPayments)
    .where(
      and(
        eq(schema.debtPayments.planId, planId),
        ownedBy(schema.debtPayments.ownerUserId, owner),
      ),
    )
    .orderBy(desc(schema.debtPayments.paidAt), desc(schema.debtPayments.id))
    .limit(limit);
}

export async function listDebtPaymentsBetween(from: string, to: string) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.debtPayments)
    .where(
      and(
        gte(schema.debtPayments.paidAt, from),
        lte(schema.debtPayments.paidAt, to),
        ownedBy(schema.debtPayments.ownerUserId, owner),
      ),
    )
    .orderBy(asc(schema.debtPayments.paidAt));
}

export async function getBudget(id: number) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.id, id),
        ownedBy(schema.budgets.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getBudgetByCategory(category: string, currency: string) {
  const owner = await getOwner();
  const rows = await db
    .select()
    .from(schema.budgets)
    .where(
      and(
        eq(schema.budgets.category, category),
        eq(schema.budgets.currency, currency),
        ownedBy(schema.budgets.ownerUserId, owner),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// Re-export sql so other modules can build raw fragments if needed.
export { sql };
