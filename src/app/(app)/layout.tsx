import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import {
  getRole,
  isAdminConfigured,
  isAuthenticated,
} from "@/lib/auth/session";
import { RoleProvider } from "@/components/app/role-context";

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
