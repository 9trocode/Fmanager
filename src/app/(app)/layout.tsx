import { redirect } from "next/navigation";
import { MobileTopBar, Sidebar } from "@/components/app/sidebar";
import {
  getRole,
  isAdminConfigured,
  isAuthenticated,
} from "@/lib/auth/session";
import { RoleProvider } from "@/components/app/role-context";
import { FloatingAdvisor } from "@/components/app/floating-advisor";
import { accrueDueFlows } from "@/lib/flow-accrual";

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
  }

  return (
    <RoleProvider role={role}>
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
        <MobileTopBar />
        <Sidebar />
        <main className="flex-1 min-w-0 relative">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-12 relative">
            {children}
          </div>
        </main>
        {/* Always-on advisor entry. Admin-only — viewers can't write
            data, so a chat that mostly does is useless to them. */}
        {role === "admin" ? <FloatingAdvisor /> : null}
      </div>
    </RoleProvider>
  );
}
