import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { HeroBackground } from "@/components/app/hero-background";
import { AlertsBanner } from "@/components/app/alerts-banner";
import { resolveMonthKey } from "@/lib/month-filter";
import { EmptyState } from "@/components/app/empty-state";
import { AddAccountDialog } from "@/components/app/add-account-dialog";
import { AddGrantDialog } from "@/components/app/add-grant-dialog";
import { getSettings } from "@/lib/db/queries";
import { getAdminProfile, getCurrentUser } from "@/lib/auth/session";
import { listActiveAlerts } from "@/lib/advisor-alerts";
import {
  computeNetWorth,
  computeThisMonthActuals,
} from "@/lib/aggregation";
import {
  BudgetsSummaryLoader,
  CardSkeleton,
  ListCardSkeleton,
  MonthStatsRowLoader,
  NetWorthMiniLoader,
  RecentTransactionsLoader,
  RunwayCardLoader,
  SavingsSummaryLoader,
  StatsRowSkeleton,
} from "./cards";

// Reads onboarding state + auth cookie + DB live every request.
// Must NOT be statically prerendered, or the build-time snapshot
// (no onboarding_complete) gets cached and always redirects.
export const dynamic = "force-dynamic";

/**
 * Streaming dashboard.
 *
 * The shell (header + hero) renders instantly. Each card is a
 * separate <Suspense> boundary that streams in as its data resolves.
 * The page itself only awaits two things up front:
 *
 *   1. The onboarding flag (so we can redirect to /welcome).
 *   2. `computeNetWorth` for the empty-state gate (so a brand-new
 *      user sees "Empty house" without flashing skeletons first).
 *      It's `react/cache`-memoised — when card loaders later call it
 *      they share this result.
 *
 * The PageHeader description also reads `computeThisMonthActuals` so
 * the monthLabel string can render with the shell. That call is
 * memoised and shared with `MonthStatsRowLoader`.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  // One settings query covers the redirect gate + base currency.
  // Was: 2 sequential getSetting() calls; now 1 batched read.
  const params = await searchParams;
  const [settings, monthKey, currentUser] = await Promise.all([
    getSettings(["onboarding_complete", "base_currency"]),
    resolveMonthKey(params.m),
    // currentUser was already memoised by the (app) layout's
    // getCurrentUser() call → this is a cache hit, no extra query.
    getCurrentUser(),
  ]);
  if (settings.onboarding_complete !== "true") {
    redirect("/welcome");
  }
  const baseCurrency = settings.base_currency ?? "USD";

  // Two cheap-but-shared awaits up front: net worth (for empty-state)
  // and this-month label (for the header). Both memoised. Active
  // alerts pull alongside — the banner only renders criticals, but
  // the query is cheap and shared with the (app) layout's count.
  const [summary, month, activeAlerts] = await Promise.all([
    computeNetWorth(baseCurrency),
    computeThisMonthActuals(baseCurrency, monthKey),
    listActiveAlerts(),
  ]);
  // The alerts banner reflects RIGHT NOW (runway, over-budget, etc.).
  // When the user is planning ahead in a future month, today's "0.0
  // months of runway" is noise — they're modeling, not firefighting.
  // Hide the banner in that view; sidebar badge still surfaces them.
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isFutureFilter = monthKey != null && monthKey > currentMonthKey;
  const criticalAlerts = isFutureFilter
    ? []
    : activeAlerts.filter((a) => a.severity === "critical");

  // Personalize the page title with the active user's first name —
  // pulls from `users.name` for invited/isolated accounts, falls back
  // to the host admin profile for the settings-admin session.
  let firstName: string | null = null;
  if (currentUser?.name) {
    firstName = currentUser.name.trim().split(/\s+/)[0] ?? null;
  } else if (!currentUser) {
    const profile = await getAdminProfile();
    firstName = profile.name?.trim().split(/\s+/)[0] ?? null;
  }
  const heading = firstName ? `Hi, ${firstName}` : "Home";

  return (
    <>
      <HeroBackground />
      <PageHeader
        size="lg"
        title={heading}
        description={`Where your money's going in ${month.monthLabel}.`}
      />

      {criticalAlerts.length > 0 ? (
        <AlertsBanner
          alerts={criticalAlerts.map((a) => ({
            id: a.id,
            title: a.title,
            body: a.body,
            actionUrl: a.actionUrl,
          }))}
        />
      ) : null}

      {!summary.hasData ? (
        <EmptyState
          icon={Wallet}
          title="Empty house"
          description="Add an account, a recurring expense, or a transaction to bring this page to life."
          action={
            <div className="flex gap-2">
              <AddAccountDialog />
              <AddGrantDialog />
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          <Suspense fallback={<StatsRowSkeleton />}>
            <MonthStatsRowLoader
              baseCurrency={baseCurrency}
              monthKey={monthKey}
            />
          </Suspense>

          <div className="grid lg:grid-cols-2 gap-6">
            <Suspense fallback={<CardSkeleton tall />}>
              <RunwayCardLoader baseCurrency={baseCurrency} />
            </Suspense>
            <Suspense fallback={<CardSkeleton tall />}>
              <BudgetsSummaryLoader
                baseCurrency={baseCurrency}
                monthKey={monthKey}
              />
            </Suspense>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Suspense fallback={<CardSkeleton />}>
              <SavingsSummaryLoader />
            </Suspense>
            <Suspense fallback={<ListCardSkeleton />}>
              <RecentTransactionsLoader monthKey={monthKey} />
            </Suspense>
          </div>

          <Suspense fallback={<CardSkeleton tall />}>
            <NetWorthMiniLoader baseCurrency={baseCurrency} />
          </Suspense>
        </div>
      )}
    </>
  );
}
