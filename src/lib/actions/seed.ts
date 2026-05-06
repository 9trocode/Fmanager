"use server";

import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db";
import { setSetting } from "@/lib/db/queries";

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
    company: "Founder Inc",
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
    vestingNotes: "Co-founder shares. Fully vested. QSBS clock started 2023-01-15.",
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
  notes?: string;
}> = [
  // Expenses
  { name: "Founder salary draw", kind: "income", category: "Salary", amount: 6500, currency: "USD", cadence: "monthly", notes: "Conservative draw; can reduce." },
  { name: "Side consulting", kind: "income", category: "Consulting", amount: 2500, currency: "USD", cadence: "monthly", notes: "1 day/week. Variable." },
  { name: "USD mortgage payment", kind: "expense", category: "Housing", amount: 1850, currency: "USD", cadence: "monthly" },
  { name: "Lagos rent (assistant + nanny)", kind: "expense", category: "Family", amount: 850_000, currency: "NGN", cadence: "monthly" },
  { name: "Health insurance", kind: "expense", category: "Insurance", amount: 480, currency: "USD", cadence: "monthly" },
  { name: "Family living (food, transport)", kind: "expense", category: "Personal", amount: 2200, currency: "USD", cadence: "monthly" },
  { name: "School fees", kind: "expense", category: "Family", amount: 12_000, currency: "USD", cadence: "yearly", notes: "Paid in 2 tranches." },
  { name: "AWS personal projects", kind: "expense", category: "Cloud / SaaS", amount: 95, currency: "USD", cadence: "monthly" },
  { name: "Subscriptions bundle", kind: "expense", category: "Subscription", amount: 78, currency: "USD", cadence: "monthly", notes: "Anthropic, Linear, Notion, Spotify, NYT." },
  { name: "Travel float", kind: "expense", category: "Personal", amount: 600, currency: "USD", cadence: "monthly", notes: "Annualized — actual is lumpy." },
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
      "Assuming Founder Inc equity is worth $0, what is my honest monthly burn floor — and am I above or below the 18-month runway threshold?",
    context:
      "Floor scenario must sustain at least 18 months of personal living without raising. If not, every other decision (exercise, hedge, lifestyle) gets re-prioritized.",
  },
];

async function wipe() {
  await db.delete(schema.valueSnapshots);
  await db.delete(schema.accounts);
  await db.delete(schema.equityGrants);
  await db.delete(schema.decisions);
  await db.delete(schema.recurringFlows);
  await db.delete(schema.fxRates);
  // Settings: keep API key + advisor model untouched (user-entered),
  // but reset base_currency to USD.
}

export async function wipeAllData() {
  await wipe();
  await db.delete(schema.settings);
  revalidatePath("/", "layout");
}

export async function seedSampleData() {
  await wipe();

  await setSetting("base_currency", "USD");
  await setSetting("advisor_model", "claude-sonnet-4-6");

  for (const a of ACCOUNTS) {
    const [created] = await db
      .insert(schema.accounts)
      .values({
        name: a.name,
        type: a.type,
        currency: a.currency,
        institution: a.institution,
        notes: a.notes,
      })
      .returning();
    if (!created) continue;
    for (const s of a.snapshots) {
      await db.insert(schema.valueSnapshots).values({
        accountId: created.id,
        value: s.value,
        currency: a.currency,
        asOf: s.asOf,
        source: "sample",
      });
    }
  }

  for (const g of GRANTS) {
    await db.insert(schema.equityGrants).values(g);
  }

  await db.insert(schema.decisions).values(DECISIONS);

  await db.insert(schema.recurringFlows).values(FLOWS);

  revalidatePath("/", "layout");
  return {
    accounts: ACCOUNTS.length,
    grants: GRANTS.length,
    decisions: DECISIONS.length,
    flows: FLOWS.length,
  };
}
