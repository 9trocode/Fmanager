import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { AccountType } from "@/lib/db/schema";

export type SettingKey =
  | "base_currency"
  | "anthropic_api_key"
  | "advisor_model";

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

export async function getBaseCurrency(): Promise<string> {
  return (await getSetting("base_currency")) ?? "USD";
}

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

export async function listAccountsWithLatest(opts: { includeArchived?: boolean } = {}) {
  const accounts = await listAccounts(opts);
  const result = await Promise.all(
    accounts.map(async (a) => {
      const latest = await getLatestSnapshot(a.id);
      return { ...a, latestValue: latest?.value ?? null, latestAsOf: latest?.asOf ?? null };
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
