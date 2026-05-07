import { redirect } from "next/navigation";
import { isAuthenticated, authDisabled } from "@/lib/auth/session";

export default async function WelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Onboarding requires admin. In dev (no ADMIN_PASSWORD) auth is bypassed.
  if (!authDisabled() && !(await isAuthenticated())) {
    redirect("/login?next=/welcome");
  }
  return (
    <div className="min-h-screen bg-background text-foreground">{children}</div>
  );
}
