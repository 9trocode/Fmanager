import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import {
  getRole,
  isAdminConfigured,
  isAuthenticated,
} from "@/lib/auth/session";
import { RoleProvider } from "@/components/app/role-context";

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

  return (
    <RoleProvider role={role}>
      <div className="min-h-screen flex">
        <Sidebar />
        <main className="flex-1 min-w-0 relative">
          <div className="max-w-6xl mx-auto px-8 py-10 md:py-12 relative">
            {children}
          </div>
        </main>
      </div>
    </RoleProvider>
  );
}
