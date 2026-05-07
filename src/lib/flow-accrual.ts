import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
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

/**
 * Per-process throttle. The (app) layout invokes accrueDueFlows() on
 * every page render, but the only thing that meaningfully changes per
 * request is "did midnight pass?". A 30-minute floor between actual
 * runs cuts ~99% of the per-nav SQL load while still catching new days
 * within half an hour of midnight. Process restart resets the gate, so
 * deploys don't miss a run.
 */
let lastAccrualAt = 0;
const ACCRUAL_THROTTLE_MS = 30 * 60 * 1000;

export async function accrueDueFlows(): Promise<{ posted: number }> {
  const now = Date.now();
  if (now - lastAccrualAt < ACCRUAL_THROTTLE_MS) {
    return { posted: 0 };
  }
  lastAccrualAt = now;

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

  // Plan all the writes in pure JS first; commit them atomically below.
  // Two reasons for the batch+transaction shape:
  //  - Per-row INSERTs each pay a WAL fsync. A salary that's a year
  //    late (24 catchup periods) × N flows used to be N·24 individual
  //    commits. One bulk insert per flow + one transaction = ~one fsync.
  //  - Atomicity. The pre-fix code could insert N period rows then
  //    crash before the lastPostedAt UPDATE, double-posting on rerun.
  //    The (flow_id, occurred_at) unique index now enforces idempotency
  //    even across crash/retry, but the transaction ensures the
  //    UPDATEs land iff the INSERTs did.
  type Insert = typeof schema.transactions.$inferInsert;
  type FlowUpdate = {
    flowId: number;
    lastPostedAt: string;
    nextDueAt: string | null;
  };
  type Plan = {
    seedLastPosted: number[]; // flow ids that just need lastPostedAt = today
    inserts: Insert[];
    updates: FlowUpdate[];
  };
  const plan: Plan = { seedLastPosted: [], inserts: [], updates: [] };

  for (const f of flows) {
    if (f.accountId == null) continue;

    // Two scheduling models:
    //
    //  A. Anchored (`nextDueAt` is set): the flow has an explicit next
    //     date — e.g. "salary lands on the 25th". The accruer posts on
    //     that exact date, then advances `nextDueAt` by one cadence so
    //     the day-of-month sticks across cycles.
    //
    //  B. Cadence-from-last (no `nextDueAt`): legacy path. The next
    //     post happens one cadence after `lastPostedAt`. First-run
    //     seeds `lastPostedAt = today` so we don't backfill.
    if (f.nextDueAt) {
      let dueDate = parseYmd(f.nextDueAt);
      let mostRecentPosted: string | null = null;
      let nextDueAfterLoop = f.nextDueAt;
      let safety = 0;
      while (safety < MAX_CATCHUP_PERIODS && dueDate <= todayDate) {
        const occurredAt = localYmd(dueDate);
        plan.inserts.push({
          kind: f.kind,
          amount: f.amount,
          currency: f.currency,
          accountId: f.accountId,
          occurredAt,
          category: f.category,
          flowId: f.id,
          notes: f.notes ?? `Auto-accrued from ${f.name}`,
        });
        mostRecentPosted = occurredAt;
        dueDate = addCadence(dueDate, f.cadence);
        nextDueAfterLoop = localYmd(dueDate);
        safety += 1;
      }
      if (mostRecentPosted) {
        plan.updates.push({
          flowId: f.id,
          lastPostedAt: mostRecentPosted,
          nextDueAt: nextDueAfterLoop,
        });
      }
      continue;
    }

    // Cadence-from-last fallback path.
    if (f.lastPostedAt == null) {
      plan.seedLastPosted.push(f.id);
      continue;
    }

    let lastPosted = f.lastPostedAt;
    let lastPostedDate = parseYmd(lastPosted);
    let safety = 0;
    while (safety < MAX_CATCHUP_PERIODS) {
      const nextDue = addCadence(lastPostedDate, f.cadence);
      if (nextDue > todayDate) break;

      const occurredAt = localYmd(nextDue);
      plan.inserts.push({
        kind: f.kind,
        amount: f.amount,
        currency: f.currency,
        accountId: f.accountId,
        occurredAt,
        category: f.category,
        flowId: f.id,
        notes: f.notes ?? `Auto-accrued from ${f.name}`,
      });
      lastPostedDate = nextDue;
      lastPosted = occurredAt;
      safety += 1;
    }

    if (safety > 0) {
      plan.updates.push({
        flowId: f.id,
        lastPostedAt: lastPosted,
        nextDueAt: null,
      });
    }
  }

  if (
    plan.inserts.length === 0 &&
    plan.updates.length === 0 &&
    plan.seedLastPosted.length === 0
  ) {
    return { posted: 0 };
  }

  const nowIso = new Date().toISOString();

  await db.transaction(async (tx) => {
    if (plan.inserts.length > 0) {
      // onConflictDoNothing leans on the partial unique index
      // (flow_id, occurred_at) WHERE flow_id IS NOT NULL added in
      // migration 0008. If the same period was posted by an earlier
      // (crashed) run, this is a no-op for that row.
      await tx
        .insert(schema.transactions)
        .values(plan.inserts)
        .onConflictDoNothing();
    }
    for (const u of plan.updates) {
      await tx
        .update(schema.recurringFlows)
        .set({
          lastPostedAt: u.lastPostedAt,
          ...(u.nextDueAt != null ? { nextDueAt: u.nextDueAt } : {}),
          updatedAt: nowIso,
        })
        .where(eq(schema.recurringFlows.id, u.flowId));
    }
    if (plan.seedLastPosted.length > 0) {
      await tx
        .update(schema.recurringFlows)
        .set({ lastPostedAt: today, updatedAt: nowIso })
        .where(inArray(schema.recurringFlows.id, plan.seedLastPosted));
    }
  });

  return { posted: plan.inserts.length };
}
