"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { setSetting } from "@/lib/db/queries";
import { assertAdmin } from "@/lib/auth/session";
import { getOwner, ownedBy } from "@/lib/db/scope";

const ACCOUNTS = [
  {
    name: "Mercury USD checking",
    type: "cash" as const,
    currency: "USD",
    institution: "Mercury",
    notes: "Operating cash + short-term reserve.",
    snapshots: [
      { value: 28500, asOf: "2025-11-01" },
      { value: 32100, asOf: "2026-02-01" },
      { value: 35420, asOf: "2026-05-01" },
    ],
  },
  {
    name: "GTBank naira savings",
    type: "cash" as const,
    currency: "NGN",
    institution: "GTBank",
    notes: "Local burn (rent, contractors, school fees).",
    snapshots: [
      { value: 21_000_000, asOf: "2026-02-01" },
      { value: 18_500_000, asOf: "2026-05-01" },
    ],
  },
  {
    name: "Wise EUR",
    type: "cash" as const,
    currency: "EUR",
    institution: "Wise",
    notes: "Travel + EU contractor float.",
    snapshots: [
      { value: 5800, asOf: "2026-01-15" },
      { value: 4200, asOf: "2026-04-20" },
    ],
  },
  {
    name: "Fidelity 401(k)",
    type: "retirement" as const,
    currency: "USD",
    institution: "Fidelity",
    notes: "Pre-startup employer rollover. Index funds.",
    snapshots: [
      { value: 51000, asOf: "2025-12-31" },
      { value: 58000, asOf: "2026-04-30" },
    ],
  },
  {
    name: "Public brokerage",
    type: "brokerage" as const,
    currency: "USD",
    institution: "Public",
    notes: "Public stocks. ETFs + a few names.",
    snapshots: [
      { value: 9800, asOf: "2026-01-10" },
      { value: 12400, asOf: "2026-04-30" },
    ],
  },
  {
    name: "Coinbase",
    type: "crypto" as const,
    currency: "USD",
    institution: "Coinbase",
    notes: "BTC + ETH. Don't watch this daily.",
    snapshots: [
      { value: 9200, asOf: "2026-01-01" },
      { value: 7800, asOf: "2026-04-30" },
    ],
  },
  {
    name: "Lekki apartment",
    type: "real_estate" as const,
    currency: "NGN",
    institution: null,
    notes: "Rough comp valuation. Update annually.",
    snapshots: [
      { value: 95_000_000, asOf: "2026-01-01" },
    ],
  },
  {
    name: "USD mortgage",
    type: "loan" as const,
    currency: "USD",
    institution: "Bank of America",
    notes: "30y fixed at 6.1%. Outstanding principal.",
    snapshots: [
      { value: 49500, asOf: "2026-01-01" },
      { value: 48100, asOf: "2026-05-01" },
    ],
  },
];

const GRANTS = [
  {
    company: "Growth Co",
    grantType: "founder_shares" as const,
    totalShares: 1_200_000,
    vestedShares: 1_200_000,
    strikePrice: 0,
    fmvPerShare: 0.85,
    exitPricePerShare: 4.5,
    currency: "USD",
    vestingStartDate: "2023-01-15",
    vestingMonths: 48,
    cliffMonths: 12,
    expectedExitMonths: 48,
    taxRatePct: 20,
    vestingNotes: "Initial equity. Fully vested. QSBS clock started 2023-01-15.",
    grantedAt: "2023-01-15",
  },
  {
    company: "Ex-Startup Co",
    grantType: "iso" as const,
    totalShares: 50_000,
    vestedShares: 22_500,
    strikePrice: 0.1,
    fmvPerShare: 2.5,
    exitPricePerShare: 15,
    currency: "USD",
    vestingStartDate: "2024-03-01",
    vestingMonths: 48,
    cliffMonths: 12,
    expectedExitMonths: 24,
    taxRatePct: 20,
    vestingNotes:
      "Standard 4yr / 1yr cliff. Cliff hit 2025-03-01. Last day to early-exercise: 2026-09-01.",
    grantedAt: "2024-03-01",
  },
  {
    company: "Acme Public",
    grantType: "rsu" as const,
    totalShares: 800,
    vestedShares: 800,
    strikePrice: 0,
    fmvPerShare: 42,
    exitPricePerShare: 42,
    currency: "USD",
    vestingStartDate: null,
    vestingMonths: null,
    cliffMonths: null,
    expectedExitMonths: 0,
    taxRatePct: 37,
    vestingNotes: "Already public. RSUs taxed as ordinary income on vest.",
    grantedAt: "2023-06-01",
  },
];

const FLOWS: Array<{
  name: string;
  kind: "income" | "expense";
  category: string;
  amount: number;
  currency: string;
  cadence: "weekly" | "monthly" | "yearly";
  /** Account this flow lands in (income) or comes out of (expense). */
  accountName?: string;
  notes?: string;
}> = [
  // Income — lands in matching cash accounts
  { name: "Founder salary draw", kind: "income", category: "Salary", amount: 6500, currency: "USD", cadence: "monthly", accountName: "Mercury USD checking", notes: "Conservative draw; can reduce." },
  { name: "Side consulting", kind: "income", category: "Consulting", amount: 2500, currency: "USD", cadence: "monthly", accountName: "Mercury USD checking", notes: "1 day/week. Variable." },
  // Expenses — drawn from matching cash accounts
  { name: "USD mortgage payment", kind: "expense", category: "Housing", amount: 1850, currency: "USD", cadence: "monthly", accountName: "Mercury USD checking", notes: "Tracks the planned payment. Log a transfer transaction monthly to actually reduce the loan balance." },
  { name: "Lagos rent (assistant + nanny)", kind: "expense", category: "Family", amount: 850_000, currency: "NGN", cadence: "monthly", accountName: "GTBank naira savings" },
  { name: "Health insurance", kind: "expense", category: "Insurance", amount: 480, currency: "USD", cadence: "monthly", accountName: "Mercury USD checking" },
  { name: "Family living (food, transport)", kind: "expense", category: "Personal", amount: 2200, currency: "USD", cadence: "monthly", accountName: "Mercury USD checking" },
  { name: "School fees", kind: "expense", category: "Family", amount: 12_000, currency: "USD", cadence: "yearly", accountName: "Mercury USD checking", notes: "Paid in 2 tranches." },
  { name: "AWS personal projects", kind: "expense", category: "Cloud / SaaS", amount: 95, currency: "USD", cadence: "monthly", accountName: "Mercury USD checking" },
  { name: "Subscriptions bundle", kind: "expense", category: "Subscription", amount: 78, currency: "USD", cadence: "monthly", accountName: "Mercury USD checking", notes: "Anthropic, Linear, Notion, Spotify, NYT." },
  { name: "Travel float", kind: "expense", category: "Personal", amount: 600, currency: "USD", cadence: "monthly", accountName: "Mercury USD checking", notes: "Annualized — actual is lumpy." },
];

const BUDGETS: Array<{
  category: string;
  monthlyLimit: number;
  currency: string;
  notes?: string;
}> = [
  // Tuned against the seeded ~30 transactions so a couple categories run hot.
  // Personal monthly spend ~$2,259 USD + ~145k NGN (~$94) → above $2,200 limit.
  { category: "Personal", monthlyLimit: 2200, currency: "USD", notes: "Groceries, dining, travel float, etc." },
  // Family ~850k NGN ≈ $548 + school fee tranches; below 1800.
  { category: "Family", monthlyLimit: 1800, currency: "USD", notes: "Lagos household + school fees." },
  // Cloud / SaaS roughly $95/mo → well under.
  { category: "Cloud / SaaS", monthlyLimit: 250, currency: "USD" },
  // Subscription bundle ~$78/mo → under, but visible.
  { category: "Subscription", monthlyLimit: 120, currency: "USD" },
  // Mortgage payments ~$1850/mo, single line. Limit 1900 → close to cap.
  { category: "Housing", monthlyLimit: 1900, currency: "USD", notes: "Mortgage + housing fees." },
];

const SAVINGS_GOALS: Array<{
  kind?: "savings" | "net_worth" | "fire" | "debt_payoff";
  name: string;
  category: string | null;
  targetAmount: number | null;
  currentAmount: number;
  currency: string;
  monthlyContribution: number;
  expectedReturnPct: number;
  horizonMonths: number;
  targetDate?: string | null;
  fireMultiplier?: number | null;
  startedAt: string;
  notes?: string;
  accountName?: string;
}> = [
  {
    name: "Emergency fund",
    category: "Emergency fund",
    targetAmount: 30_000,
    currentAmount: 12_500,
    currency: "USD",
    monthlyContribution: 1_500,
    expectedReturnPct: 4,
    horizonMonths: 12,
    startedAt: "2025-12-01",
    notes: "6 months of personal floor burn. HYSA at ~4% APY.",
  },
  {
    name: "Lagos house deposit",
    category: "Housing",
    targetAmount: 25_000_000,
    currentAmount: 4_200_000,
    currency: "NGN",
    monthlyContribution: 800_000,
    expectedReturnPct: 8,
    horizonMonths: 24,
    startedAt: "2026-01-01",
    notes: "Naira-denominated; account for inflation. Move toward USD if NGN slides further.",
  },
  {
    name: "Tax reserve 2026",
    category: "Tax reserve",
    targetAmount: 18_000,
    currentAmount: 6_000,
    currency: "USD",
    monthlyContribution: 1_500,
    expectedReturnPct: 4,
    horizonMonths: 8,
    startedAt: "2026-03-01",
    notes: "Quarterly estimate buffer + April catch-up.",
  },
  {
    kind: "net_worth",
    name: "First million",
    category: "Net worth",
    targetAmount: 1_000_000,
    currentAmount: 0,
    currency: "USD",
    monthlyContribution: 4_500,
    expectedReturnPct: 7,
    horizonMonths: 60,
    targetDate: "2030-01-01",
    startedAt: "2026-01-01",
    notes:
      "Total liquid + non-grant net worth. Plan against floor; equity is upside.",
  },
  {
    kind: "fire",
    name: "Financial independence",
    category: "Retirement",
    targetAmount: null,
    currentAmount: 0,
    currency: "USD",
    monthlyContribution: 4_500,
    expectedReturnPct: 7,
    horizonMonths: 240,
    fireMultiplier: 25,
    startedAt: "2026-01-01",
    notes:
      "25× annual expenses (4% rule). Computed live from your recurring flow expenses.",
  },
  {
    kind: "debt_payoff",
    name: "Pay off USD mortgage",
    category: "Housing",
    targetAmount: 0,
    currentAmount: 49_500, // original principal at goal creation
    currency: "USD",
    monthlyContribution: 1_400,
    expectedReturnPct: 0,
    horizonMonths: 36,
    targetDate: "2029-01-01",
    accountName: "USD mortgage",
    startedAt: "2026-01-01",
    notes: "Aggressive principal pay-down plan.",
  },
];

const DECISIONS = [
  {
    question:
      "Should I shift 30–40% of my NGN cash to USD this quarter, given continued naira volatility?",
    context:
      "Most real obligations (cloud, contractors, travel) are USD-denominated. NGN exposure beyond ~3 months of local burn is risk.",
  },
  {
    question:
      "Should I early-exercise my Ex-Startup ISO grant before 2026-09-01, or let the post-termination window force the choice?",
    context:
      "22,500 shares vested at $0.10 strike, $2.50 FMV. AMT exposure ~$54k spread. Need ~$2,250 cash for strike. Last day is 2026-09-01.",
  },
  {
    question:
      "Assuming my Founder Inc equity is worth $0, can my personal liquid savings sustain at least 12 months of living expenses without selling other assets?",
    context:
      "Personal sustainability check. Floor scenario must cover personal life independent of company outcomes. If not, every other decision (exercise, hedge, lifestyle, savings goals) needs to be re-prioritized to fix this first.",
  },
];

async function wipe() {
  // Scoped wipe: deletes only the rows belonging to the active owner.
  // No tenant can clobber another's data even if they hit the
  // "wipe all data" / "seed sample data" admin tools.
  const owner = await getOwner();
  await db.delete(schema.transactions).where(ownedBy(schema.transactions.ownerUserId, owner));
  await db.delete(schema.valueSnapshots).where(ownedBy(schema.valueSnapshots.ownerUserId, owner));
  await db.delete(schema.accounts).where(ownedBy(schema.accounts.ownerUserId, owner));
  await db.delete(schema.equityGrants).where(ownedBy(schema.equityGrants.ownerUserId, owner));
  await db.delete(schema.decisions).where(ownedBy(schema.decisions.ownerUserId, owner));
  await db.delete(schema.savingsGoals).where(ownedBy(schema.savingsGoals.ownerUserId, owner));
  await db.delete(schema.recurringFlows).where(ownedBy(schema.recurringFlows.ownerUserId, owner));
  await db.delete(schema.budgets).where(ownedBy(schema.budgets.ownerUserId, owner));
  // FX rates are global — never wiped per-tenant.
}

/**
 * Build a deterministic-ish set of ~30 sample transactions spread across
 * the last ~60 days, using accounts that already exist after seeding.
 * Categories align with the seeded recurring flows so a future budget
 * feature can join them.
 */
function buildSampleTransactions(idsByName: Record<string, number>) {
  const today = new Date();
  function daysAgo(n: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  const mercury = idsByName["Mercury USD checking"];
  const gtbank = idsByName["GTBank naira savings"];
  const wise = idsByName["Wise EUR"];
  const brokerage = idsByName["Public brokerage"];
  const crypto = idsByName["Coinbase"];

  type Tx = {
    accountId: number;
    destAccountId?: number | null;
    kind: "expense" | "income" | "transfer";
    amount: number;
    currency: string;
    category: string | null;
    occurredAt: string;
    notes?: string | null;
  };

  const rows: Tx[] = [];
  const push = (t: Tx) => {
    if (Number.isFinite(t.accountId)) rows.push(t);
  };

  // Salary + consulting income (USD)
  push({ accountId: mercury, kind: "income", amount: 6500, currency: "USD", category: "Salary", occurredAt: daysAgo(58), notes: "Salary draw" });
  push({ accountId: mercury, kind: "income", amount: 6500, currency: "USD", category: "Salary", occurredAt: daysAgo(28), notes: "Salary draw" });
  push({ accountId: mercury, kind: "income", amount: 2500, currency: "USD", category: "Consulting", occurredAt: daysAgo(21), notes: "Acme retainer" });
  push({ accountId: mercury, kind: "income", amount: 1800, currency: "USD", category: "Consulting", occurredAt: daysAgo(7), notes: "Half-month side project" });

  // Mortgage + housing
  push({ accountId: mercury, kind: "expense", amount: 1850, currency: "USD", category: "Housing", occurredAt: daysAgo(55), notes: "Mortgage payment" });
  push({ accountId: mercury, kind: "expense", amount: 1850, currency: "USD", category: "Housing", occurredAt: daysAgo(25), notes: "Mortgage payment" });

  // Insurance
  push({ accountId: mercury, kind: "expense", amount: 480, currency: "USD", category: "Insurance", occurredAt: daysAgo(50) });
  push({ accountId: mercury, kind: "expense", amount: 480, currency: "USD", category: "Insurance", occurredAt: daysAgo(20) });

  // Subscriptions / SaaS
  push({ accountId: mercury, kind: "expense", amount: 78, currency: "USD", category: "Subscription", occurredAt: daysAgo(48), notes: "Anthropic + Linear + Notion" });
  push({ accountId: mercury, kind: "expense", amount: 95, currency: "USD", category: "Cloud / SaaS", occurredAt: daysAgo(46), notes: "AWS personal" });
  push({ accountId: mercury, kind: "expense", amount: 78, currency: "USD", category: "Subscription", occurredAt: daysAgo(18) });
  push({ accountId: mercury, kind: "expense", amount: 95, currency: "USD", category: "Cloud / SaaS", occurredAt: daysAgo(16) });

  // Personal
  push({ accountId: mercury, kind: "expense", amount: 220, currency: "USD", category: "Personal", occurredAt: daysAgo(42), notes: "Groceries" });
  push({ accountId: mercury, kind: "expense", amount: 64, currency: "USD", category: "Personal", occurredAt: daysAgo(35), notes: "Dinner out" });
  push({ accountId: mercury, kind: "expense", amount: 410, currency: "USD", category: "Transport", occurredAt: daysAgo(32), notes: "Flights" });
  push({ accountId: mercury, kind: "expense", amount: 175, currency: "USD", category: "Personal", occurredAt: daysAgo(11), notes: "Pharmacy + groceries" });
  push({ accountId: mercury, kind: "expense", amount: 1200, currency: "USD", category: "Personal", occurredAt: daysAgo(4), notes: "New laptop battery + repairs" });

  // NGN family + contractor expenses
  push({ accountId: gtbank, kind: "expense", amount: 850_000, currency: "NGN", category: "Family", occurredAt: daysAgo(51), notes: "Lagos rent + nanny" });
  push({ accountId: gtbank, kind: "expense", amount: 850_000, currency: "NGN", category: "Family", occurredAt: daysAgo(21), notes: "Lagos rent + nanny" });
  push({ accountId: gtbank, kind: "expense", amount: 320_000, currency: "NGN", category: "Contractors", occurredAt: daysAgo(40), notes: "Local dev contractor" });
  push({ accountId: gtbank, kind: "expense", amount: 145_000, currency: "NGN", category: "Personal", occurredAt: daysAgo(13), notes: "Groceries + transport" });

  // EUR travel float
  push({ accountId: wise, kind: "expense", amount: 320, currency: "EUR", category: "Transport", occurredAt: daysAgo(45), notes: "Berlin trip" });
  push({ accountId: wise, kind: "expense", amount: 180, currency: "EUR", category: "Personal", occurredAt: daysAgo(43), notes: "Hotel + meals" });
  push({ accountId: wise, kind: "expense", amount: 95, currency: "EUR", category: "Subscription", occurredAt: daysAgo(15), notes: "EU contractor invoice" });

  // Crypto / brokerage activity
  push({ accountId: brokerage, kind: "income", amount: 32, currency: "USD", category: "Dividends", occurredAt: daysAgo(38), notes: "VTI dividend" });
  push({ accountId: crypto, kind: "income", amount: 18, currency: "USD", category: "Interest", occurredAt: daysAgo(9), notes: "Staking yield" });

  // Transfers — money movement, not P&L.
  push({
    accountId: mercury,
    destAccountId: gtbank,
    kind: "transfer",
    amount: 1500,
    currency: "USD",
    category: "Internal transfer",
    occurredAt: daysAgo(36),
    notes: "USD → NGN top-up (rate-converted at bank)",
  });
  push({
    accountId: mercury,
    destAccountId: brokerage,
    kind: "transfer",
    amount: 1000,
    currency: "USD",
    category: "Internal transfer",
    occurredAt: daysAgo(30),
    notes: "Monthly investing top-up",
  });
  push({
    accountId: mercury,
    destAccountId: wise,
    kind: "transfer",
    amount: 800,
    currency: "USD",
    category: "Internal transfer",
    occurredAt: daysAgo(14),
    notes: "EUR float refill",
  });

  return rows.filter((r) => Number.isFinite(r.accountId));
}

export async function wipeAllData() {
  await assertAdmin();
  await wipe();
  // Clear scoped settings for the active owner. Host-only keys
  // (admin_*, registration_mode) live in `settings` and get cleared
  // for the host; isolated users have user_settings rows wiped instead.
  const owner = await getOwner();
  if (owner != null) {
    await db
      .delete(schema.userSettings)
      .where(eq(schema.userSettings.userId, owner));
  } else {
    await db.delete(schema.settings);
  }
  revalidatePath("/", "layout");
}

export async function seedSampleData() {
  await assertAdmin();
  await wipe();

  await setSetting("base_currency", "USD");
  await setSetting("advisor_model", "claude-sonnet-4-6");

  // Stamp every seeded row with the active owner so isolated tenants
  // who hit "give me sample data" get the dataset in their own scope.
  const owner = await getOwner();

  const idsByName: Record<string, number> = {};
  for (const a of ACCOUNTS) {
    const [created] = await db
      .insert(schema.accounts)
      .values({
        name: a.name,
        type: a.type,
        currency: a.currency,
        institution: a.institution,
        notes: a.notes,
        ownerUserId: owner,
      })
      .returning();
    if (!created) continue;
    idsByName[a.name] = created.id;
    for (const s of a.snapshots) {
      await db.insert(schema.valueSnapshots).values({
        accountId: created.id,
        value: s.value,
        currency: a.currency,
        asOf: s.asOf,
        source: "sample",
        ownerUserId: owner,
      });
    }
  }

  for (const g of GRANTS) {
    await db.insert(schema.equityGrants).values({ ...g, ownerUserId: owner });
  }

  await db
    .insert(schema.decisions)
    .values(DECISIONS.map((d) => ({ ...d, ownerUserId: owner })));

  const flowRows = FLOWS.map(({ accountName, ...rest }) => ({
    ...rest,
    accountId: accountName ? (idsByName[accountName] ?? null) : null,
    ownerUserId: owner,
  }));
  await db.insert(schema.recurringFlows).values(flowRows);

  const txRows = buildSampleTransactions(idsByName).map((t) => ({
    ...t,
    ownerUserId: owner,
  }));
  if (txRows.length > 0) {
    await db.insert(schema.transactions).values(txRows);
  }

  if (BUDGETS.length > 0) {
    await db
      .insert(schema.budgets)
      .values(BUDGETS.map((b) => ({ ...b, ownerUserId: owner })));
  }

  if (SAVINGS_GOALS.length > 0) {
    // Owner-scoped lookup — without the filter, an isolated tenant
    // seeding sample data would resolve account names against
    // EVERY tenant's accounts and could foreign-key its goals to
    // another tenant's account row.
    const ownAccounts = await db
      .select()
      .from(schema.accounts)
      .where(ownedBy(schema.accounts.ownerUserId, owner));
    const accountByName = new Map(ownAccounts.map((a) => [a.name, a.id]));
    const goalRows = SAVINGS_GOALS.map(({ accountName, ...rest }) => ({
      ...rest,
      accountId: accountName ? (accountByName.get(accountName) ?? null) : null,
      ownerUserId: owner,
    }));
    await db.insert(schema.savingsGoals).values(goalRows);
  }

  revalidatePath("/", "layout");
  return {
    accounts: ACCOUNTS.length,
    grants: GRANTS.length,
    decisions: DECISIONS.length,
    flows: FLOWS.length,
    transactions: txRows.length,
    budgets: BUDGETS.length,
    savings: SAVINGS_GOALS.length,
  };
}
