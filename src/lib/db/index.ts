import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import * as schema from "./schema";

/**
 * Multi-tenancy strategy
 * ──────────────────────
 * Cairn supports two ways of running an instance:
 *
 *  1. Single-tenant / shared (default). One SQLite file at
 *     `./data/app.db`. The host owns all data. Invited family members
 *     (`users.data_scope = "shared"`) read + write the SAME file.
 *
 *  2. Multi-tenant / isolated. The host's own data still lives in
 *     `./data/app.db`, but every "isolated" user — minted via open
 *     registration or an isolated-scope invite — gets their own DB
 *     file at `./data/tenants/tenant_<userId>.db`. Their accounts /
 *     transactions / budgets / equity / etc. exist only in that file
 *     and are unreadable from any other context.
 *
 * Auth + invite data ALWAYS lives in the host DB (`hostDb`). Finance
 * data routes through `db`, which resolves to the active tenant's DB
 * via `AsyncLocalStorage`. Pages/API routes call `withTenant()` once
 * to install the context, then use `db` as before — no per-call-site
 * changes needed.
 */

const HOST_DB_PATH = process.env.DATABASE_URL ?? "./data/app.db";
const TENANT_DIR = process.env.TENANT_DB_DIR ?? "./data/tenants";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const dbCache = new Map<string, DrizzleDb>();

function tenantPathFor(tenantId: number | null): string {
  if (tenantId == null) return HOST_DB_PATH;
  return join(TENANT_DIR, `tenant_${tenantId}.db`);
}

function openDb(path: string, runMigrations: boolean): DrizzleDb {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("cache_size = -65536");
  sqlite.pragma("mmap_size = 268435456");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");

  const handle = drizzle(sqlite, { schema });

  // Tenant DBs are created lazily on first access — apply migrations
  // exactly once when the file is brand-new (or behind). The host DB
  // gets migrated at deploy time via `pnpm db:push`, but tenants
  // can't because they don't exist yet at deploy time.
  if (runMigrations) {
    try {
      migrate(handle, { migrationsFolder: "drizzle" });
    } catch (e) {
      // Existing tenant DB that's already migrated will throw on
      // re-applying earlier migrations — non-fatal here.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists|duplicate column/i.test(msg)) {
        throw e;
      }
    }
  }

  return handle;
}

function getDbFor(tenantId: number | null): DrizzleDb {
  const path = tenantPathFor(tenantId);
  let cached = dbCache.get(path);
  if (cached) return cached;
  // Tenant DBs (non-null id) get auto-migrated on first open.
  cached = openDb(path, tenantId != null);
  dbCache.set(path, cached);
  return cached;
}

/**
 * Per-request tenant context. `null` (or no context at all) means
 * "operate on the host DB" — used by the original settings-admin and
 * by `data_scope = "shared"` users who edit the host's data directly.
 */
type TenantContext = { tenantId: number | null };
const tenantStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Run `fn` with a tenant context bound. Pass `null` to explicitly
 * use the host DB even within a wider tenant scope.
 */
export function withTenant<T>(
  tenantId: number | null,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return tenantStorage.run({ tenantId }, fn);
}

/** The active tenant id, or null if no context is bound. */
export function getActiveTenantId(): number | null {
  return tenantStorage.getStore()?.tenantId ?? null;
}

function resolveActiveDb(): DrizzleDb {
  return getDbFor(getActiveTenantId());
}

/**
 * Tenant-scoped database handle.
 *
 * Resolves to the active tenant's DB via AsyncLocalStorage on every
 * property access. When no context is bound, falls back to the host
 * DB — preserving back-compat for the single-tenant default path.
 *
 * Importing `@/lib/db` MUST NOT open the SQLite file (next build's
 * "Collecting page data" parallelism races to create it). The Proxy
 * defers `openDb()` to the first real property access.
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const active = resolveActiveDb();
    const value = Reflect.get(active, prop, receiver);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as DrizzleDb;

/**
 * Always-host database handle. Use this for auth/admin tables —
 * `users`, `invites`, `settings` — which live in the host DB
 * regardless of the active tenant context.
 */
export const hostDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const active = getDbFor(null);
    const value = Reflect.get(active, prop, receiver);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as DrizzleDb;

export { schema };
