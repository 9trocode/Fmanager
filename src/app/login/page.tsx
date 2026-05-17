import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/app/submit-button";
import { CairnMark } from "@/components/app/cairn-mark";
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
import { getSetting } from "@/lib/db/queries";
import { loginWithCredentials } from "@/lib/actions/auth";
import { PasswordInput } from "@/components/app/password-input";

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
  const closedError = params.error === "registration_closed";
  const next = params.next ?? "/dashboard";
  const [profile, registrationModeRaw] = await Promise.all([
    getAdminProfile(),
    getSetting("registration_mode"),
  ]);
  const registrationOpen =
    registrationModeRaw === "invite" || registrationModeRaw === "open";

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1.5">
          <div className="size-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center mx-auto">
            <CairnMark size={22} bare className="text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Cairn</h1>
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
                  autoComplete="email"
                  autoFocus
                  placeholder={
                    process.env.VIEWER_PASSWORD
                      ? "or leave blank for viewer access"
                      : "you@example.com"
                  }
                />
              </div>
              <PasswordInput
                name="password"
                required
                autoComplete={"current-password"}
              />
              {hasError ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    Email or password didn&apos;t match.
                  </AlertDescription>
                </Alert>
              ) : null}
              {closedError ? (
                <Alert>
                  <AlertDescription>
                    Registration is closed on this instance. Ask the owner to
                    enable it or send you an invite.
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

        {registrationOpen ? (
          <p className="text-center text-xs text-muted-foreground">
            Have an invite or new here?{" "}
            <Link
              href="/register"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Create an account
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
