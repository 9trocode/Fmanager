import { redirect } from "next/navigation";
import { MobileTopBar, Sidebar } from "@/components/app/sidebar";
import {
  getActiveTenantId,
  getRole,
  isAdminConfigured,
  isAuthenticated,
} from "@/lib/auth/session";
import { withTenant } from "@/lib/db";
import { RoleProvider } from "@/components/app/role-context";
import { FloatingAdvisor } from "@/components/app/floating-advisor";
import { ScreenLockProvider } from "@/components/app/screen-lock";
import { accrueDueFlows } from "@/lib/flow-accrual";
import { getSetting } from "@/lib/db/queries";
import {
  countActiveAlerts,
  runAdvisorChecks,
} from "@/lib/advisor-alerts";

// Every page in the (app) segment reads from the SQLite DB (accounts, flows,
// budgets, etc.). Forcing dynamic rendering on the layout prevents Next from
// trying to prerender any of them at build time — which would fail in the
// Docker builder stage where ./data/app.db has no schema yet.
//
// This inherits to all child route segments, so individual page files don't
// need to repeat the export.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // First-run: no admin yet → force setup.
  if (!(await isAdminConfigured())) {
    redirect("/welcome?step=0");
  }
  if (!(await isAuthenticated())) redirect("/login");

  // Bind the tenant context for everything downstream — finance reads
  // and writes will route to the active tenant's DB (host vs isolated).
  // Auth tables continue to use `hostDb` directly via session.ts.
  const tenantId = await getActiveTenantId();
  return withTenant(tenantId, () => renderApp({ children }));
}

async function renderApp({ children }: { children: React.ReactNode }) {
  const role = (await getRole()) ?? "admin";

  // Lazy auto-accrual. Once the user is past auth, post any recurring
  // flows whose cadence has elapsed since the last accrual — that's how
  // a monthly salary turns into real transactions on the linked account
  // and net worth actually reflects it. Cheap when nothing is due.
  // Viewer role is read-only by design, so skip writes there.
  if (role === "admin") {
    try {
      await accrueDueFlows();
    } catch (err) {
      // Don't fail the whole layout if accrual hits a snag — log and
      // let the user keep using the app.
      console.error("[accrueDueFlows] failed:", err);
    }
    // Same throttle pattern as accrueDueFlows — runs at most every
    // 30 minutes per process. Keeps the proactive alerts surface in
    // sync without thrashing the DB on every nav.
    try {
      await runAdvisorChecks();
    } catch (err) {
      console.error("[runAdvisorChecks] failed:", err);
    }
  }

  // Drives the sidebar badge. Cheap GROUP BY query — runs after the
  // throttled check above so the count reflects the freshest state.
  let alertCount = 0;
  let alertCritical = 0;
  try {
    const c = await countActiveAlerts();
    alertCount = c.total;
    alertCritical = c.critical;
  } catch {
    // Non-fatal — render without a badge.
  }

  // Screen-lock + panic settings, threaded into the client provider.
  // Defaults: idle lock disabled, panic redirects to /login.
  const idleMinutesRaw = await getSetting("screen_lock_timeout_minutes");
  const idleMinutes = Number(idleMinutesRaw) || 0;
  const panicRedirectUrl =
    (await getSetting("panic_redirect_url")) || "/login";

  return (
    <RoleProvider role={role}>
     <ScreenLockProvider
        idleMinutes={idleMinutes}
        panicRedirectUrl={panicRedirectUrl}
      >
      {/*
        Layout strategy:
          * <md  — single column. <MobileTopBar> is a sticky header with
                   a hamburger that opens the same nav inside a Sheet.
          *  md+ — two-column flex. <Sidebar> is the always-visible 288px
                   left rail; main column gets the rest.
        Mobile padding is tighter (px-4 py-6) so cramped phone viewports
        don't waste edge gutters; desktop keeps the breathable px-8 py-12.
      */}
      <div className="min-h-screen flex flex-col md:flex-row">
        <MobileTopBar
          alertCount={alertCount}
          alertCritical={alertCritical}
          panicRedirectUrl={panicRedirectUrl}
        />
        <Sidebar
          alertCount={alertCount}
          alertCritical={alertCritical}
          panicRedirectUrl={panicRedirectUrl}
        />
        <main className="flex-1 min-w-0 relative">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-12 relative">
            {children}
          </div>
        </main>
        {/* Always-on advisor entry. Admin-only — viewers can't write
            data, so a chat that mostly does is useless to them. */}
        {role === "admin" ? <FloatingAdvisor /> : null}
      </div>
      </ScreenLockProvider>
    </RoleProvider>
  );
}
