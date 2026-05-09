import "server-only";
import * as schema from "./schema";
import { getAdapter } from "./adapter";

/**
 * Driver-agnostic DB exports.
 *
 * Driver selection lives in `./adapter.ts` (currently SQLite, with a
 * Postgres slot ready to wire up). This module is the single import
 * surface for app code: `import { db, hostDb, schema } from "@/lib/db"`.
 *
 * The Proxy here defers `getAdapter()` to the first real property
 * access — module load stays side-effect free, which matters during
 * `next build`'s "Collecting page data" parallel workers (each worker
 * eagerly evaluating server modules used to race to open the SQLite
 * file and hit SQLITE_BUSY).
 */

type DrizzleDb = ReturnType<typeof drizzleHandle>;

// Helper used purely for the type — never invoked at runtime.
function drizzleHandle() {
  return getAdapter().db as ReturnType<
    typeof import("drizzle-orm/better-sqlite3").drizzle<typeof schema>
  >;
}

export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    const active = getAdapter().db as DrizzleDb;
    const value = Reflect.get(active, prop, receiver);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as DrizzleDb;

/**
 * Single-DB deployment alias of `db`. Auth/admin code uses this name
 * to declare intent ("this read goes to host tables") without coupling
 * to the underlying tenancy strategy.
 */
export const hostDb = db;

export { schema };
