import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import {
  computeBudgetStatus,
  computeCashRunway,
} from "@/lib/aggregation";
import { computeGoalState, type Goal } from "@/lib/goals";
import {
  getBaseCurrency,
  listSavingsGoals,
} from "@/lib/db/queries";

/**
 * Proactive advisor alerts.
 *
 * Generates rows in `advisor_alerts` when deterministic rules trip:
 *   - runway < 3 months (critical) or 3–6 months (warning)
 *   - any budget over 100% this month
 *   - any goal off-pace toward its target
 *
 * Each alert has a period-scoped `dedupKey` so repeating the check
 * doesn't insert duplicates within the same window. The unique index
 * + onConflictDoNothing handles that without a pre-read.
 *
 * Auto-resolution: at the end of each run, any active alert whose
 * underlying condition is no longer true gets `resolvedAt` set, so it
 * stops counting toward the unread badge.
 */

type AlertInsert = typeof schema.advisorAlerts.$inferInsert;

// Per-process throttle. Like accrueDueFlows — every (app) page render
// invokes us, but the underlying state only meaningfully changes a few
// times a day. 30 minutes between runs keeps the alert state fresh
// without firing 100 read queries per nav.
let lastRunAt = 0;
const RUN_THROTTLE_MS = 30 * 60 * 1000;

export async function runAdvisorChecks(): Promise<{ inserted: number; resolved: number }> {
  const now = Date.now();
  if (now - lastRunAt < RUN_THROTTLE_MS) {
    return { inserted: 0, resolved: 0 };
  }
  lastRunAt = now;

  const baseCurrency = await getBaseCurrency();
  const today = new Date();
  const yyyyMm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const yyyyMmDd = `${yyyyMm}-${String(today.getDate()).padStart(2, "0")}`;

  const inserts: AlertInsert[] = [];
  // Track which dedup keys are "still tripping" this run so we can
  // auto-resolve any active alert that didn't show up.
  const stillActive = new Set<string>();

  // ── 1. Runway check ────────────────────────────────────────────────
  const runway = await computeCashRunway(baseCurrency);
  const months = runway.monthsNetRunway ?? runway.monthsRunway ?? Infinity;
  if (months < 3 && months !== Infinity) {
    const dedup = `runway_critical_${yyyyMmDd}`;
    stillActive.add(dedup);
    inserts.push({
      kind: "runway_critical",
      severity: "critical",
      title: `${months.toFixed(1)} months of runway left`,
      body: `Liquid cash ${fmt(runway.liquidCash, baseCurrency)} · monthly net ${runway.netMonthly < 0 ? "−" : "+"}${fmt(Math.abs(runway.netMonthly), baseCurrency)}. Pull spending in or move money in fast.`,
      actionUrl: "/cash-flow",
      contextJson: JSON.stringify({ months, baseCurrency }),
      dedupKey: dedup,
    });
  } else if (months < 6 && months !== Infinity) {
    const dedup = `runway_tight_${yyyyMm}`;
    stillActive.add(dedup);
    inserts.push({
      kind: "runway_tight",
      severity: "warning",
      title: `Runway is ${months.toFixed(1)} months — tight`,
      body: `You're not in trouble yet, but at the current burn you'd need to top up by month ${Math.floor(months)}.`,
      actionUrl: "/cash-flow",
      contextJson: JSON.stringify({ months, baseCurrency }),
      dedupKey: dedup,
    });
  }

  // ── 2. Over-budget categories ──────────────────────────────────────
  const budgets = await computeBudgetStatus(baseCurrency);
  for (const b of budgets.overBudget) {
    const dedup = `budget_over_${b.id}_${yyyyMm}`;
    stillActive.add(dedup);
    const overshoot = b.percentUsed - 100;
    inserts.push({
      kind: "budget_over",
      severity: overshoot > 30 ? "critical" : "warning",
      title: `${b.category} is ${overshoot.toFixed(0)}% over budget`,
      body: `Spent ${fmt(b.spentThisMonth, b.baseCurrency)} of a ${fmt(b.monthlyLimit, b.baseCurrency)} cap.`,
      actionUrl: `/budgets/${b.id}`,
      contextJson: JSON.stringify({ budgetId: b.id, percentUsed: b.percentUsed }),
      dedupKey: dedup,
    });
  }

  // ── 3. Goals off-pace ──────────────────────────────────────────────
  const goalRows = await listSavingsGoals();
  for (const row of goalRows) {
    if (row.archived) continue;
    const goal: Goal = row;
    let state;
    try {
      state = await computeGoalState(goal, baseCurrency);
    } catch {
      continue;
    }
    if (state.done) continue;
    if (goal.targetDate) {
      const targetDate = new Date(goal.targetDate);
      const monthsToTarget = monthsBetween(today, targetDate);
      if (
        state.etaMonths != null &&
        monthsToTarget > 0 &&
        state.etaMonths > monthsToTarget * 1.25
      ) {
        const dedup = `goal_off_pace_${goal.id}_${yyyyMm}`;
        stillActive.add(dedup);
        inserts.push({
          kind: "goal_off_pace",
          severity: "warning",
          title: `${goal.name} is off-pace`,
          body: `At current contributions you'd hit it in ~${state.etaMonths}mo, but the target is ${monthsToTarget}mo away. Bump the monthly or push the date.`,
          actionUrl: `/savings/${goal.id}`,
          contextJson: JSON.stringify({
            goalId: goal.id,
            etaMonths: state.etaMonths,
            monthsToTarget,
          }),
          dedupKey: dedup,
        });
      }
    } else if (
      state.etaMonths != null &&
      goal.horizonMonths > 0 &&
      state.etaMonths > goal.horizonMonths * 1.25
    ) {
      const dedup = `goal_off_pace_${goal.id}_${yyyyMm}`;
      stillActive.add(dedup);
      inserts.push({
        kind: "goal_off_pace",
        severity: "warning",
        title: `${goal.name} is off-pace`,
        body: `Hitting it would take ~${state.etaMonths}mo at this contribution; your horizon is ${goal.horizonMonths}mo.`,
        actionUrl: `/savings/${goal.id}`,
        contextJson: JSON.stringify({
          goalId: goal.id,
          etaMonths: state.etaMonths,
          horizonMonths: goal.horizonMonths,
        }),
        dedupKey: dedup,
      });
    }
  }

  // ── Insert (idempotent via unique dedupKey) + auto-resolve ────────
  let inserted = 0;
  if (inserts.length > 0) {
    const result = await db
      .insert(schema.advisorAlerts)
      .values(inserts)
      .onConflictDoNothing()
      .returning({ id: schema.advisorAlerts.id });
    inserted = result.length;
  }

  // Anything currently active whose condition is no longer tripping
  // gets resolvedAt set so the badge reflects reality. We only touch
  // alerts whose kind we own (so a future hand-managed alert wouldn't
  // get clobbered).
  const ownedKinds = ["runway_critical", "runway_tight", "budget_over", "goal_off_pace"];
  const active = await db
    .select({
      id: schema.advisorAlerts.id,
      dedupKey: schema.advisorAlerts.dedupKey,
      kind: schema.advisorAlerts.kind,
    })
    .from(schema.advisorAlerts)
    .where(
      and(
        isNull(schema.advisorAlerts.dismissedAt),
        isNull(schema.advisorAlerts.resolvedAt),
      ),
    );
  let resolved = 0;
  const nowIso = new Date().toISOString();
  for (const a of active) {
    if (!ownedKinds.includes(a.kind)) continue;
    if (stillActive.has(a.dedupKey)) continue;
    await db
      .update(schema.advisorAlerts)
      .set({ resolvedAt: nowIso })
      .where(eq(schema.advisorAlerts.id, a.id));
    resolved += 1;
  }

  return { inserted, resolved };
}

export async function listActiveAlerts() {
  return db
    .select()
    .from(schema.advisorAlerts)
    .where(
      and(
        isNull(schema.advisorAlerts.dismissedAt),
        isNull(schema.advisorAlerts.resolvedAt),
      ),
    )
    .orderBy(desc(schema.advisorAlerts.createdAt));
}

export async function listRecentAlerts(limit = 50) {
  return db
    .select()
    .from(schema.advisorAlerts)
    .orderBy(desc(schema.advisorAlerts.createdAt))
    .limit(limit);
}

export async function countActiveAlerts(): Promise<{
  total: number;
  critical: number;
}> {
  const rows = await db
    .select({
      severity: schema.advisorAlerts.severity,
      n: sql<number>`count(*)`,
    })
    .from(schema.advisorAlerts)
    .where(
      and(
        isNull(schema.advisorAlerts.dismissedAt),
        isNull(schema.advisorAlerts.resolvedAt),
      ),
    )
    .groupBy(schema.advisorAlerts.severity);
  let total = 0;
  let critical = 0;
  for (const r of rows) {
    total += Number(r.n);
    if (r.severity === "critical") critical += Number(r.n);
  }
  return { total, critical };
}

function fmt(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toFixed(0)} ${currency}`;
  }
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30);
}
