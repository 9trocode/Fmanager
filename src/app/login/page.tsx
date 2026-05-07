import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/app/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  isAdminConfigured,
  isAuthenticated,
  getAdminProfile,
} from "@/lib/auth/session";
import { loginWithCredentials } from "@/lib/actions/auth";

// Reads admin state from DB + auth cookie on every request.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  // If no admin exists yet, redirect into setup.
  if (!(await isAdminConfigured())) {
    redirect("/welcome?step=0");
  }
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const hasError = params.error === "1";
  const next = params.next ?? "/dashboard";
  const profile = await getAdminProfile();

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1.5">
          <div className="size-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center text-base font-semibold mx-auto">
            ƒ
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Founder Finance</h1>
          <p className="text-sm text-muted-foreground">
            {profile.name
              ? `Welcome back, ${profile.name}.`
              : "Sign in to your self-hosted instance."}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>
              {process.env.VIEWER_PASSWORD
                ? "Use your admin email + password, or the viewer password."
                : "Use the email and password you set during setup."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={loginWithCredentials} className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={profile.email ?? ""}
                  autoComplete="email"
                  autoFocus
                  placeholder={
                    process.env.VIEWER_PASSWORD
                      ? "or leave blank for viewer access"
                      : "you@example.com"
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              {hasError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    Email or password didn&apos;t match.
                  </AlertDescription>
                </Alert>
              ) : null}
              <SubmitButton
                className="w-full"
                size="lg"
                loadingText="Signing in…"
              >
                Sign in
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          New here?{" "}
          <Link
            href="/welcome"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Set up your account
          </Link>
        </p>
      </div>
    </main>
  );
}
