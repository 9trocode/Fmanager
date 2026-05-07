import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { localToday, localYmd } from "@/lib/dates";

/**
 * Auto-accrues recurring flows into real transactions so account balances
 * (and therefore net worth) actually reflect the planned monthly income /
 * expenses without requiring the user to log every paycheck by hand.
 *
 * Behavior:
 *   - For each non-archived flow with a linked account:
 *     - If `lastPostedAt` is null, seed it to today (no backfill — flows
 *       only accrue going forward to avoid surprise transactions on
 *       upgrade or first run after this feature lands).
 *     - While `lastPostedAt + one cadence` is on or before today, insert
 *       a transaction dated at that period boundary, link it via
 *       `flowId`, and bump `lastPostedAt`. Caps catch-up loops at 24
 *       periods so a year-old never-accrued flow doesn't suddenly post
 *       a wall of history.
 *   - Idempotent: posted transactions are tagged `flowId`, so a stray
 *     re-run never duplicates a period that's already been accrued.
 *
 * Called lazily from page reads that depend on net worth (dashboard,
 * net-worth, accounts, transactions). Cheap when nothing is due — one
 * SELECT and a tight in-memory loop.
 */

type Cadence = "weekly" | "monthly" | "yearly";

const MAX_CATCHUP_PERIODS = 24;

function addCadence(d: Date, cadence: Cadence): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (cadence === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (cadence === "yearly") {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    // monthly — preserve day-of-month where possible (Feb 30 collapses
    // to the last day of Feb, matching how a payday lands the same day
    // each month).
    const wantDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(
      next.getFullYear(),
      next.getMonth() + 1,
      0,
    ).getDate();
    next.setDate(Math.min(wantDay, lastDay));
  }
  return next;
}

function parseYmd(s: string): Date {
  // Avoid `new Date(s)` — it parses YYYY-MM-DD as UTC and shifts a day
  // for negative timezones. Construct via local-component args.
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export async function accrueDueFlows(): Promise<{ posted: number }> {
  const today = localToday();
  const todayDate = parseYmd(today);

  const flows = await db
    .select()
    .from(schema.recurringFlows)
    .where(
      and(
        eq(schema.recurringFlows.archived, false),
        isNotNull(schema.recurringFlows.accountId),
      ),
    );

  let posted = 0;

  for (const f of flows) {
    if (f.accountId == null) continue;

    // Seed first-time accrual to today so we don't retroactively post
    // months of history on the very first run after this feature lands.
    let lastPosted = f.lastPostedAt ?? today;
    let lastPostedDate = parseYmd(lastPosted);

    if (f.lastPostedAt == null) {
      await db
        .update(schema.recurringFlows)
        .set({ lastPostedAt: today, updatedAt: new Date().toISOString() })
        .where(eq(schema.recurringFlows.id, f.id));
      // Skip immediate posting for the first cadence.
      continue;
    }

    let safety = 0;
    while (safety < MAX_CATCHUP_PERIODS) {
      const nextDue = addCadence(lastPostedDate, f.cadence);
      if (nextDue > todayDate) break;

      const occurredAt = localYmd(nextDue);
      await db.insert(schema.transactions).values({
        kind: f.kind,
        amount: f.amount,
        currency: f.currency,
        accountId: f.accountId,
        occurredAt,
        category: f.category,
        flowId: f.id,
        notes: f.notes ?? `Auto-accrued from ${f.name}`,
      });
      posted += 1;
      lastPostedDate = nextDue;
      lastPosted = occurredAt;
      safety += 1;
    }

    if (safety > 0) {
      await db
        .update(schema.recurringFlows)
        .set({ lastPostedAt: lastPosted, updatedAt: new Date().toISOString() })
        .where(eq(schema.recurringFlows.id, f.id));
    }
  }

  return { posted };
}
