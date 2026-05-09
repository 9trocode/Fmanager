import "server-only";
import * as sqliteSchema from "./schema";

/**
 * DB adapter — single seam between Cairn's app code and the driver.
 *
 * Why an adapter at all? Cairn ships SQLite by default because that's
 * the self-host story (one file, no Postgres to babysit). But the data
 * model is small + standard enough that operators who already run a
 * Postgres can point Cairn at it instead. This file is the only place
 * driver selection lives — every other file in the codebase imports
 * `db` / `schema` / `hostDb` from `./index` and never sees the driver.
 *
 * Adding a new driver
 * ───────────────────
 * 1. Mirror `schema.ts` for the new dialect (e.g. `schema-pg.ts` using
 *    `pgTable` / `integer` / `text` from `drizzle-orm/pg-core`). Keep
 *    column names + types identical so the application code doesn't
 *    care which dialect is active.
 * 2. Add a branch below in `createAdapter()` that imports the new
 *    schema + the matching drizzle driver, then returns the adapter.
 * 3. Update `drizzle.config.ts` (or add a sibling) so `pnpm db:generate`
 *    emits dialect-specific migration SQL.
 *
 * The default + only wired driver today is `sqlite` (better-sqlite3).
 * `pg` is recognised but throws a helpful "wire it up" error so an
 * operator who flips DATABASE_DRIVER without doing the schema port
 * gets a clear message instead of a runtime explosion mid-request.
 */

export type DriverName = "sqlite" | "pg";

/**
 * Minimal contract every driver implementation returns. `db` is the
 * drizzle handle; `schema` is the dialect-specific schema module so
 * callers can use `schema.accounts` etc. without thinking about it.
 *
 * `dispose` is reserved — useful later for Postgres pools that need
 * graceful shutdown on SIGTERM. SQLite's better-sqlite3 handle is
 * synchronous so we just leave it open for the process lifetime.
 */
export type DbAdapter = {
  driver: DriverName;
  /** Drizzle DB handle, typed against the active schema module. */
  db: unknown;
  /** Schema module — `schema.accounts`, `schema.transactions`, etc. */
  schema: typeof sqliteSchema;
  /** Optional shutdown hook (Postgres pool close, etc.). */
  dispose?: () => Promise<void>;
};

function resolveDriver(): DriverName {
  const raw = (process.env.DATABASE_DRIVER ?? "sqlite").toLowerCase();
  if (raw === "sqlite" || raw === "pg") return raw;
  throw new Error(
    `Unknown DATABASE_DRIVER=${raw}. Supported: "sqlite" (default) or "pg".`,
  );
}

/**
 * Build the SQLite adapter. Pulled into its own function so the
 * better-sqlite3 import only happens when the SQLite driver is
 * actually selected — leaving room for a future Postgres-only build
 * to drop better-sqlite3 from the dependency tree entirely.
 */
function createSqliteAdapter(): DbAdapter {
  // Lazy require so a future pg-only deployment doesn't pay the
  // better-sqlite3 native-build cost.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3") as typeof import("drizzle-orm/better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { existsSync, mkdirSync } = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { dirname } = require("node:path") as typeof import("node:path");

  const path = process.env.DATABASE_URL ?? "./data/app.db";
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(path);
  // WAL: concurrent readers without blocking; foreign keys per-conn.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Wait up to 5s on a write lock instead of throwing SQLITE_BUSY.
  sqlite.pragma("busy_timeout = 5000");
  // Performance pragmas — tiny finance DBs fit in RAM after warmup.
  sqlite.pragma("cache_size = -65536");
  sqlite.pragma("mmap_size = 268435456");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");

  return {
    driver: "sqlite",
    db: drizzle(sqlite, { schema: sqliteSchema }),
    schema: sqliteSchema,
    async dispose() {
      sqlite.close();
    },
  };
}

/**
 * Postgres slot. Wire it up by:
 *   1. Add `schema-pg.ts` mirroring `schema.ts` with `pgTable` etc.
 *   2. `pnpm add postgres drizzle-orm/postgres-js` (or `pg` + `drizzle-orm/node-postgres`).
 *   3. Replace this throw with the actual driver construction:
 *
 *        const postgres = require("postgres");
 *        const { drizzle } = require("drizzle-orm/postgres-js");
 *        const sql = postgres(process.env.DATABASE_URL!);
 *        return { driver: "pg", db: drizzle(sql, { schema: pgSchema }),
 *                 schema: pgSchema, dispose: async () => sql.end() };
 *
 *   4. Update drizzle.config.ts dialect to "postgresql" for pnpm db:generate.
 */
function createPgAdapter(): DbAdapter {
  throw new Error(
    "DATABASE_DRIVER=pg is recognised but not yet wired. See src/lib/db/adapter.ts → createPgAdapter() for the 4-step port.",
  );
}

let _adapter: DbAdapter | null = null;

export function getAdapter(): DbAdapter {
  if (_adapter) return _adapter;
  const driver = resolveDriver();
  if (driver === "sqlite") {
    _adapter = createSqliteAdapter();
  } else {
    _adapter = createPgAdapter();
  }
  return _adapter;
}
