import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { getRole, isAuthenticated } from "@/lib/auth/session";
import { RoleProvider } from "@/components/app/role-context";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAuthenticated())) redirect("/login");
  const role = (await getRole()) ?? "admin";

  return (
    <RoleProvider role={role}>
      <div className="min-h-screen flex">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
        </main>
      </div>
    </RoleProvider>
  );
}
