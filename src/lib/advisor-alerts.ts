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
  listAccountsWithEffective,
  listSavingsGoals,
} from "@/lib/db/queries";
import { getOwner, ownedBy } from "@/lib/db/scope";
import { convert } from "@/lib/fx";
import { ThrottleStore } from "@/lib/throttle-store";

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

// Per-tenant throttle. Multi-tenant: tenant A triggering a check
// must not throttle tenant B. Keyed by ownerUserId (or "host" for
// the settings-admin / shared scope). Capped via ThrottleStore so
// the map can't grow forever in deployments with many tenants.
const lastRunByOwner = new ThrottleStore();
const RUN_THROTTLE_MS = 30 * 60 * 1000;

export async function runAdvisorChecks(): Promise<{ inserted: number; resolved: number }> {
  const owner = await getOwner();
  const throttleKey = owner == null ? "host" : `u${owner}`;
  const now = Date.now();
  if (now - lastRunByOwner.get(throttleKey) < RUN_THROTTLE_MS) {
    return { inserted: 0, resolved: 0 };
  }
  lastRunByOwner.set(throttleKey, now);

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

  // ── 4. Idle cash sitting in a low-yield account ───────────────────
  //
  // When a CASH-type account holds materially more than a few months
  // of expenses, that money is leaking purchasing power to inflation.
  // Surface a one-line nudge with concrete instrument suggestions.
  // Only fires for cash accounts (brokerage / retirement accounts are
  // already in some yield vehicle by definition); only when the user
  // has recurring expenses to compare against (no expenses = no
  // meaningful "idle" definition).
  if (runway.monthlyExpenses > 0) {
    const accounts = await listAccountsWithEffective();
    const monthsThreshold = 6; // > 6 months of burn parked in cash = clearly idle
    for (const a of accounts) {
      if (a.type !== "cash") continue;
      if (a.archived) continue;
      if (a.effectiveValue == null || a.effectiveValue <= 0) continue;
      // Convert balance to base for the burn comparison.
      const inBase =
        a.currency === baseCurrency
          ? a.effectiveValue
          : await convert(a.effectiveValue, a.currency, baseCurrency);
      const monthsCovered = inBase / runway.monthlyExpenses;
      if (monthsCovered <= monthsThreshold) continue;
      const dedup = `idle_cash_${a.id}_${yyyyMm}`;
      stillActive.add(dedup);
      // Per-currency instrument hints. Naira → MMF / T-bills / Bamboo
      // for USD exposure. USD → high-yield savings, T-bills, brokerage.
      // Generic fallback otherwise.
      const hints =
        a.currency === "NGN"
          ? "Move the surplus into a money market fund (~12% APY), Treasury bills (~17% APR), or Bamboo for USD-denominated equity."
          : a.currency === "USD"
            ? "Move the surplus into a high-yield savings account (~4% APY), short-duration Treasuries, or a brokerage."
            : "Consider moving the surplus into a money market fund, Treasuries, or a brokerage account.";
      inserts.push({
        kind: "idle_cash",
        severity: "info",
        title: `${a.name}: ${monthsCovered.toFixed(0)}mo of expenses sitting idle`,
        body: `${inBase.toFixed(0)} ${baseCurrency} (${a.currency} ${a.effectiveValue.toFixed(0)}) covers ${monthsCovered.toFixed(0)} months of expenses — well past a normal emergency cushion. ${hints}`,
        actionUrl: `/accounts/${a.id}`,
        contextJson: JSON.stringify({
          accountId: a.id,
          balance: a.effectiveValue,
          currency: a.currency,
          monthsCovered,
        }),
        dedupKey: dedup,
      });
    }
  }

  // ── Insert (idempotent via unique dedupKey) + auto-resolve ────────
  let inserted = 0;
  if (inserts.length > 0) {
    const stamped = inserts.map((i) => ({ ...i, ownerUserId: owner }));
    const result = await db
      .insert(schema.advisorAlerts)
      .values(stamped)
      .onConflictDoNothing()
      .returning({ id: schema.advisorAlerts.id });
    inserted = result.length;
  }

  // Auto-resolve only the active alerts in THIS owner's scope.
  const ownedKinds = [
    "runway_critical",
    "runway_tight",
    "budget_over",
    "goal_off_pace",
    "idle_cash",
  ];
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
        ownedBy(schema.advisorAlerts.ownerUserId, owner),
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
  const owner = await getOwner();
  return db
    .select()
    .from(schema.advisorAlerts)
    .where(
      and(
        isNull(schema.advisorAlerts.dismissedAt),
        isNull(schema.advisorAlerts.resolvedAt),
        ownedBy(schema.advisorAlerts.ownerUserId, owner),
      ),
    )
    .orderBy(desc(schema.advisorAlerts.createdAt));
}

export async function listRecentAlerts(limit = 50) {
  const owner = await getOwner();
  return db
    .select()
    .from(schema.advisorAlerts)
    .where(ownedBy(schema.advisorAlerts.ownerUserId, owner))
    .orderBy(desc(schema.advisorAlerts.createdAt))
    .limit(limit);
}

/**
 * Alerts created within a calendar month (inclusive start, exclusive
 * next-month start). Used by the alerts page when the user has
 * scoped the global month filter to a past month — they want to see
 * what was flagged THEN, regardless of current dismissed/resolved
 * state.
 *
 * `monthKey` is the same `YYYY-MM` shape used elsewhere on the app.
 */
export async function listAlertsInMonth(monthKey: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return [];
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return [];
  // Half-open interval on the createdAt timestamp. createdAt is an
  // ISO-ish string in this schema (drizzle text column with default
  // CURRENT_TIMESTAMP); lexicographic compare matches chronological
  // for that format.
  const start = `${monthKey}-01 00:00:00`;
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const end = `${nextMonth}-01 00:00:00`;
  const owner = await getOwner();
  return db
    .select()
    .from(schema.advisorAlerts)
    .where(
      and(
        sql`${schema.advisorAlerts.createdAt} >= ${start}`,
        sql`${schema.advisorAlerts.createdAt} < ${end}`,
        ownedBy(schema.advisorAlerts.ownerUserId, owner),
      ),
    )
    .orderBy(desc(schema.advisorAlerts.createdAt));
}

export async function countActiveAlerts(): Promise<{
  total: number;
  critical: number;
}> {
  const owner = await getOwner();
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
        ownedBy(schema.advisorAlerts.ownerUserId, owner),
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
