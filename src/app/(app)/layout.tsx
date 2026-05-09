import { redirect } from "next/navigation";
import { after } from "next/server";
import { MobileTopBar, Sidebar } from "@/components/app/sidebar";
import {
  getAdminProfile,
  getCurrentUser,
  getRole,
  isAdminConfigured,
  isAuthenticated,
} from "@/lib/auth/session";
import { RoleProvider } from "@/components/app/role-context";
import { FloatingAdvisor } from "@/components/app/floating-advisor";
import { ScreenLockProvider } from "@/components/app/screen-lock";
import { accrueDueFlows } from "@/lib/flow-accrual";
import { getSettings } from "@/lib/db/queries";
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
  // First-run: no admin yet → force setup. The session helpers are
  // now react/cache-wrapped — multiple calls in this render share the
  // same cookie unpack + admin_password_hash read.
  if (!(await isAdminConfigured())) {
    redirect("/welcome?step=0");
  }
  if (!(await isAuthenticated())) redirect("/login");

  // Everything below is independent — fan it out in parallel.
  // Includes: role + active user, alert count for the sidebar badge,
  // and the two screen-lock settings (combined into one getSettings
  // call that hits the table once for both keys).
  const [role, currentUser, countResult, lockSettings] = await Promise.all([
    getRole().then((r) => r ?? "admin"),
    getCurrentUser(),
    countActiveAlerts().catch(() => ({ total: 0, critical: 0 })),
    getSettings(["screen_lock_timeout_minutes", "panic_redirect_url"]),
  ]);

  // Lazy auto-accrual + advisor check. Both write to the DB but
  // explicitly throttle per-tenant inside, so most renders are no-ops.
  // Move them off the response path with `after()` so the user gets
  // the page back even when a tenant's throttle window opens. The
  // first navigation after a 30-min gap previously paid the full
  // accrual + alert recompute latency before any HTML streamed.
  if (role === "admin") {
    after(async () => {
      try {
        await accrueDueFlows();
      } catch (err) {
        console.error("[accrueDueFlows] failed:", err);
      }
      try {
        await runAdvisorChecks();
      } catch (err) {
        console.error("[runAdvisorChecks] failed:", err);
      }
    });
  }

  const alertCount = countResult.total;
  const alertCritical = countResult.critical;
  const idleMinutes = Number(lockSettings.screen_lock_timeout_minutes) || 0;
  const panicRedirectUrl = lockSettings.panic_redirect_url || "/login";

  // Sidebar identity. getCurrentUser was already part of the Promise.all
  // above; only fetch admin profile when no user row matched (host).
  let whoami: { label: string; sub?: string | null } | null = null;
  if (currentUser) {
    const label = currentUser.name?.trim() || currentUser.email;
    whoami = {
      label,
      sub: currentUser.name && currentUser.name.trim() ? currentUser.email : null,
    };
  } else {
    const profile = await getAdminProfile();
    if (profile.email || profile.name) {
      const label = profile.name?.trim() || profile.email!;
      whoami = {
        label,
        sub: profile.name && profile.name.trim() ? profile.email : null,
      };
    }
  }

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
          whoami={whoami}
        />
        <Sidebar
          alertCount={alertCount}
          alertCritical={alertCritical}
          panicRedirectUrl={panicRedirectUrl}
          whoami={whoami}
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
