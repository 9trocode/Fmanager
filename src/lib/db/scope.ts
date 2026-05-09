import "server-only";
import { cache } from "react";
import { eq, isNull, type AnyColumn, type SQL } from "drizzle-orm";
import { getActiveOwnerUserId } from "@/lib/auth/session";

/**
 * Scoping helpers for the multi-tenant single-DB layout.
 *
 * Every "owned" table (accounts, transactions, budgets, equity, etc.)
 * has an `owner_user_id` column. Reads filter by it; writes stamp it.
 * The host (settings-admin + every shared-scope user) operates on
 * rows where it IS NULL. Isolated users operate on rows where it
 * equals their user id.
 *
 * Usage in a query:
 *
 *   const owner = await getActiveOwnerUserId();
 *   await db.select().from(schema.accounts)
 *     .where(ownedBy(schema.accounts.ownerUserId, owner));
 *
 * Usage in an insert:
 *
 *   await db.insert(schema.accounts).values({
 *     ...,
 *     ownerUserId: await getActiveOwnerUserId(),
 *   });
 */

/**
 * SQL filter: `column = ownerId` for isolated users, or `column IS NULL`
 * for host-scope sessions. Compose into any drizzle WHERE.
 */
export function ownedBy(column: AnyColumn, ownerId: number | null): SQL {
  if (ownerId == null) return isNull(column);
  return eq(column, ownerId);
}

/**
 * Per-request memo of the active owner. Avoid hitting `cookies()` and
 * the users table on every query helper inside one render.
 */
export const getOwner = cache(async (): Promise<number | null> => {
  return getActiveOwnerUserId();
});
