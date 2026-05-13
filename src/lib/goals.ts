import "server-only";
import { computeMonthlyCashFlow, computeNetWorth } from "@/lib/aggregation";
import { getAccount, getEffectiveBalance } from "@/lib/db/queries";
import { convert } from "@/lib/fx";
import type { GoalKind } from "@/lib/db/schema";

export type Goal = {
  id: number;
  kind: GoalKind;
  name: string;
  category: string | null;
  targetAmount: number | null;
  currentAmount: number;
  currency: string;
  monthlyContribution: number;
  expectedReturnPct: number;
  horizonMonths: number;
  targetDate: string | null;
  fireMultiplier: number | null;
  startedAt: string;
  accountId: number | null;
  notes: string | null;
  archived: boolean;
};

export type GoalState = {
  goal: Goal;
  /** Current value, in goal.currency. */
  current: number;
  /** Target value, in goal.currency. Null when not applicable. */
  target: number | null;
  /** 0–100+ (can exceed when over-target / debt cleared). */
  percent: number;
  /**
   * Months until target reached at current pace. Null when not computable
   * (no contribution + no return + no progress, or already at goal, etc.).
   */
  etaMonths: number | null;
  done: boolean;
  /** Plain-English single-line context for the goal. */
  description: string;
  /**
   * When `goal.accountId` is set, surface the funding account so the UI
   * can show "what's actually in this account" alongside the goal's
   * target. Reported in `goal.currency` after FX conversion. Null when
   * no account is linked or its balance can't be resolved.
   */
  fundingAccount?: {
    id: number;
    name: string;
    currency: string;
    /** Account's effective balance in its native currency. */
    balanceNative: number;
    /** Same balance converted into `goal.currency` for direct compare. */
    balanceInGoalCurrency: number;
  } | null;
};

const DEFAULT_FIRE_MULTIPLIER = 25;
const SAFETY_MAX_MONTHS = 600; // 50 years cap on ETA solver loops

/** Solve "how many months until savings reach target". */
function monthsToTarget(opts: {
  current: number;
  target: number;
  monthly: number;
  monthlyReturn: number;
}): number | null {
  const { current, target, monthly, monthlyReturn: r } = opts;
  if (target <= current) return 0;
  if (monthly <= 0 && r <= 0) return null;
  let value = current;
  for (let m = 1; m <= SAFETY_MAX_MONTHS; m++) {
    value = value * (1 + r) + monthly;
    if (value >= target) return m;
  }
  return null;
}

/**
 * Resolves the funding-account snapshot for any goal with `accountId`
 * set, regardless of kind. Returns null when no account is linked or
 * its balance is unresolvable. Surfacing this for every kind makes
 * the goal list show "In {Account}: balance" on FIRE, Net Worth, and
 * Debt Payoff goals too — not just savings.
 */
async function resolveFundingAccount(
  goal: Goal,
): Promise<GoalState["fundingAccount"]> {
  if (goal.accountId == null) return null;
  const [acct, balance] = await Promise.all([
    getAccount(goal.accountId),
    getEffectiveBalance(goal.accountId),
  ]);
  if (!acct || balance.effectiveValue == null) return null;
  // Don't clamp at 0 for loan-style accounts (debt payoff): the
  // "balance" there IS the remaining principal. For everything else
  // negative balance = liability bleeding into a cash slot, which we
  // floor to 0 for display.
  const balanceNative =
    acct.type === "loan"
      ? balance.effectiveValue
      : Math.max(0, balance.effectiveValue);
  const balanceInGoalCurrency =
    acct.currency === goal.currency
      ? balanceNative
      : await convert(balanceNative, acct.currency, goal.currency);
  return {
    id: acct.id,
    name: acct.name,
    currency: acct.currency,
    balanceNative,
    balanceInGoalCurrency,
  };
}

export async function computeGoalState(
  goal: Goal,
  baseCurrency: string,
): Promise<GoalState> {
  switch (goal.kind) {
    case "savings": {
      const target = goal.targetAmount;
      // When the goal is tied to an account, the account's effective
      // balance IS the source of truth for "how much have I saved" —
      // every contribution lands there, every withdrawal leaves from
      // there. Fall back to the manually-tracked currentAmount only
      // when no account is linked.
      const fundingAccount = await resolveFundingAccount(goal);
      const current = fundingAccount
        ? fundingAccount.balanceInGoalCurrency
        : goal.currentAmount;
      const percent = target && target > 0 ? (current / target) * 100 : 0;
      const eta =
        target == null
          ? null
          : monthsToTarget({
              current,
              target,
              monthly: goal.monthlyContribution,
              monthlyReturn: goal.expectedReturnPct / 100 / 12,
            });
      return {
        goal,
        current,
        target,
        percent,
        etaMonths: eta,
        done: target != null && current >= target,
        description: fundingAccount
          ? `Tracked against ${fundingAccount.name} (${fundingAccount.currency}). Contributions land there directly.`
          : `Save ${goal.currency} via ${goal.monthlyContribution.toLocaleString()} / mo at ${goal.expectedReturnPct}% blended return.`,
        fundingAccount,
      };
    }

    case "net_worth": {
      const [summary, fundingAccount] = await Promise.all([
        computeNetWorth(baseCurrency),
        resolveFundingAccount(goal),
      ]);
      // Floor net worth (without equity) is the honest current.
      const floorInBase = summary.totals.floor;
      const current = await convert(floorInBase, baseCurrency, goal.currency);
      const target = goal.targetAmount;
      // Clamp at 0% when in deficit. Net worth can be negative (loans
      // > liquid), and (negative / positive) produces a misleading
      // negative percent on the progress bar (e.g. "-7%"). Treat
      // "in the hole" as 0% reached; the deficit is conveyed by the
      // distance-to-target widget elsewhere.
      const percent =
        target && target > 0
          ? Math.max(0, (current / target) * 100)
          : 0;
      const eta =
        target == null
          ? null
          : monthsToTarget({
              current,
              target,
              monthly: goal.monthlyContribution,
              monthlyReturn: goal.expectedReturnPct / 100 / 12,
            });
      return {
        goal,
        current,
        target,
        percent,
        etaMonths: eta,
        done: target != null && current >= target,
        description:
          "Total net worth (floor scenario, equity at zero). Tracks your real balance sheet.",
        fundingAccount,
      };
    }

    case "fire": {
      const [summary, flow, fundingAccount] = await Promise.all([
        computeNetWorth(baseCurrency),
        computeMonthlyCashFlow(baseCurrency),
        resolveFundingAccount(goal),
      ]);
      const annualExpenses = flow.expenses * 12;
      const multiplier = goal.fireMultiplier ?? DEFAULT_FIRE_MULTIPLIER;
      const targetInBase = annualExpenses * multiplier;
      const target = await convert(targetInBase, baseCurrency, goal.currency);
      const currentInBase = summary.totals.floor;
      const current = await convert(currentInBase, baseCurrency, goal.currency);
      // Clamp at 0% when in deficit — same reasoning as net_worth.
      const percent = target > 0 ? Math.max(0, (current / target) * 100) : 0;
      const eta = monthsToTarget({
        current,
        target,
        monthly: goal.monthlyContribution,
        monthlyReturn: goal.expectedReturnPct / 100 / 12,
      });
      return {
        goal,
        current,
        target,
        percent,
        etaMonths: eta,
        done: current >= target && target > 0,
        description: `Financial independence: ${multiplier}× annual expenses (${goal.currency} ${Math.round(annualExpenses).toLocaleString()}/yr).`,
        fundingAccount,
      };
    }

    case "debt_payoff": {
      if (goal.accountId == null) {
        return {
          goal,
          current: goal.currentAmount,
          target: 0,
          percent: 0,
          etaMonths: null,
          done: false,
          description: "No loan account linked. Edit the goal to link one.",
        };
      }
      const [balance, fundingAccount] = await Promise.all([
        getEffectiveBalance(goal.accountId),
        resolveFundingAccount(goal),
      ]);
      const principalNow = Math.max(0, balance.effectiveValue ?? 0);
      // currentAmount stores the original principal at goal creation time.
      const principalStart = goal.currentAmount > 0
        ? goal.currentAmount
        : principalNow;
      const paidDown = Math.max(0, principalStart - principalNow);
      const percent =
        principalStart > 0 ? (paidDown / principalStart) * 100 : 0;
      // Months to zero at current monthlyContribution (ignoring interest).
      const eta =
        goal.monthlyContribution > 0
          ? Math.ceil(principalNow / goal.monthlyContribution)
          : null;
      return {
        goal,
        current: principalNow,
        target: 0,
        percent,
        etaMonths: eta,
        done: principalNow <= 0,
        description: `Pay down loan to zero. Started at ${goal.currency} ${principalStart.toLocaleString()}.`,
        fundingAccount,
      };
    }
  }
}

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  savings: "Savings goal",
  net_worth: "Net worth target",
  fire: "Financial independence",
  debt_payoff: "Debt payoff",
};

export const GOAL_KIND_BADGE: Record<GoalKind, string> = {
  savings: "Savings",
  net_worth: "Net worth",
  fire: "FIRE",
  debt_payoff: "Debt payoff",
};
