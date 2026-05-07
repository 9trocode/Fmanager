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

export { schema };
