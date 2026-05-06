export type GoalLike = {
  currentAmount: number;
  targetAmount: number | null;
  monthlyContribution: number;
  expectedReturnPct: number;
  horizonMonths: number;
};

export type GoalProjectionPoint = {
  month: number;
  value: number;
};

export function projectGoal(goal: GoalLike): GoalProjectionPoint[] {
  const r = goal.expectedReturnPct / 100 / 12;
  const c = goal.monthlyContribution;
  const N = Math.max(0, Math.floor(goal.horizonMonths));
  const points: GoalProjectionPoint[] = [];
  for (let m = 0; m <= N; m++) {
    const v =
      r === 0
        ? goal.currentAmount + c * m
        : goal.currentAmount * Math.pow(1 + r, m) +
          c * ((Math.pow(1 + r, m) - 1) / r);
    points.push({ month: m, value: v });
  }
  return points;
}

export function projectedEndValue(goal: GoalLike): number {
  const r = goal.expectedReturnPct / 100 / 12;
  const c = goal.monthlyContribution;
  const N = Math.max(0, Math.floor(goal.horizonMonths));
  return r === 0
    ? goal.currentAmount + c * N
    : goal.currentAmount * Math.pow(1 + r, N) +
        c * ((Math.pow(1 + r, N) - 1) / r);
}

/**
 * Months until the goal hits targetAmount given current rate.
 * Returns 0 if already at/above target, or null if it never hits within ~50 years.
 */
export function monthsToTarget(goal: GoalLike): number | null {
  if (goal.targetAmount == null) return null;
  if (goal.currentAmount >= goal.targetAmount) return 0;
  const r = goal.expectedReturnPct / 100 / 12;
  const c = goal.monthlyContribution;
  if (c <= 0 && r <= 0) return null;
  const target = goal.targetAmount;
  for (let m = 1; m <= 600; m++) {
    const v =
      r === 0
        ? goal.currentAmount + c * m
        : goal.currentAmount * Math.pow(1 + r, m) +
          c * ((Math.pow(1 + r, m) - 1) / r);
    if (v >= target) return m;
  }
  return null;
}

export function progressPct(goal: GoalLike): number {
  if (goal.targetAmount == null || goal.targetAmount <= 0) return 0;
  return Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
