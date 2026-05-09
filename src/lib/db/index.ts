import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_URL ?? "./data/app.db";

type DrizzleDb = ReturnType<typeof openDb>;

let _db: DrizzleDb | null = null;

function openDb(): ReturnType<typeof drizzle<typeof schema>> {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const sqlite = new Database(DB_PATH);
  // WAL gives concurrent readers without blocking; foreign keys must be
  // turned on per-connection in SQLite.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // Wait up to 5s on a write lock instead of throwing SQLITE_BUSY
  // immediately. Defends against transient lock contention when a server
  // boots and several handlers race to read at the same time.
  sqlite.pragma("busy_timeout = 5000");
  // Performance pragmas. Personal-finance DBs are tiny (kilobytes for
  // most users), so the entire working set easily fits in memory once
  // these are tuned.
  //   * cache_size: bump page cache from ~2MB default to ~64MB. After
  //     warmup, virtually no disk reads for hot tables.
  //   * mmap_size: memory-map the DB file (cap 256MB). Reads bypass
  //     libsqlite's I/O layer when pages are mapped.
  //   * synchronous=NORMAL: still safe with WAL; fsync at checkpoints
  //     only. Cuts write latency.
  //   * temp_store=MEMORY: keeps SQLite's intermediate tables off disk.
  sqlite.pragma("cache_size = -65536");
  sqlite.pragma("mmap_size = 268435456");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");

  return drizzle(sqlite, { schema });
}

/**
 * Lazy database handle.
 *
 * Importing `@/lib/db` MUST NOT open the SQLite file. `next build` evaluates
 * every server module across many parallel workers during "Collecting page
 * data" — if each worker eagerly opens the same SQLite file in the empty
 * Docker builder stage, they race to create it and one of them fails with
 * `SqliteError: SQLITE_BUSY` (`database is locked`), aborting the build.
 *
 * The Proxy defers `openDb()` to the first real property access — i.e. the
 * first `db.select(...)` from an actual handler at runtime — so module
 * evaluation stays side-effect free. Methods are bound to the underlying
 * drizzle instance so `this` is correct inside chains like
 * `db.insert(table).values(...)`.
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    if (!_db) _db = openDb();
    const value = Reflect.get(_db, prop, receiver);
    return typeof value === "function" ? value.bind(_db) : value;
  },
}) as DrizzleDb;

/**
 * Single-DB deployment. `hostDb` is identical to `db` — kept as an
 * alias so auth/admin code can declare its intent ("this read goes
 * to the host's auth tables, not a tenant") without coupling to the
 * underlying tenancy strategy. The two diverged briefly when we
 * tried per-tenant SQLite files; we reverted to a single DB + SQL
 * filters so analytics + ops + backups stay simple.
 */
export const hostDb = db;

export { schema };
