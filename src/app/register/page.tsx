import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, Sparkles } from "lucide-react";
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
import { isAdminConfigured, isAuthenticated } from "@/lib/auth/session";
import { getSetting } from "@/lib/db/queries";
import { registerWithCode } from "@/lib/actions/members";
import { PasswordInput } from "@/components/app/password-input";

// Reads registration state from DB on every request.
export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  mismatch: "Passwords didn't match.",
  email: "Enter a valid email address.",
  weak: "Password must be at least 8 characters.",
  invalid_code: "That invite code is invalid, expired, or already used.",
  email_mismatch: "This invite was issued to a different email address.",
  exists: "An account with that email already exists. Try signing in instead.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string; email?: string }>;
}) {
  if (!(await isAdminConfigured())) {
    redirect("/welcome?step=0");
  }
  if (await isAuthenticated()) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage = params.error ? ERROR_COPY[params.error] : null;
  const mode = (await getSetting("registration_mode")) ?? "closed";

  if (mode !== "invite" && mode !== "open") {
    return (
      <main className="min-h-screen grid place-items-center px-4 bg-background">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="size-10 rounded-lg bg-muted text-muted-foreground grid place-items-center mx-auto">
            <Lock className="size-5" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight">
              Registration is closed
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The owner of this Cairn instance hasn&apos;t opened sign-ups. Ask
              them to send you an invite code or to enable open registration in
              Settings → Members.
            </p>
          </div>
          <Link
            href="/login"
            className="text-sm underline underline-offset-2 hover:text-foreground"
          >
            ← Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  const inviteRequired = mode === "invite";

  return (
    <main className="min-h-screen grid place-items-center px-4 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1.5">
          <div className="size-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center mx-auto">
            <CairnMark size={22} bare className="text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            {inviteRequired ? "Join this Cairn" : "Create your Cairn"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {inviteRequired
              ? "You need an invite code from the owner to create an account."
              : "Sign up and get your own private Cairn — your data, your accounts, your view."}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Create account</CardTitle>
            <CardDescription>
              {inviteRequired
                ? "Codes are single-use. The owner sets your role (admin / viewer) and whether you join the host's data or get your own."
                : "Open registration. You're the admin of your own private workspace — none of your data is visible to the host or any other user."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={registerWithCode} className="space-y-4">
              {inviteRequired ? (
                <div className="space-y-1.5">
                  <Label htmlFor="code">Invite code</Label>
                  <Input
                    id="code"
                    name="code"
                    defaultValue={params.code ?? ""}
                    autoComplete="one-time-code"
                    placeholder="paste the code from the owner"
                    required
                    autoFocus
                  />
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md bg-secondary/60 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  <Sparkles className="size-3 text-primary mt-0.5 shrink-0" />
                  <span>
                    Your accounts, transactions, budgets, goals, and equity
                    grants will be stored in your own isolated workspace. The
                    host of this instance and other users cannot see them.
                  </span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  autoFocus={!inviteRequired}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name (optional)</Label>
                <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  placeholder="What should we call you?"
                />
              </div>
              <PasswordInput
                name="password"
                label="Password"
                required
                autoComplete={"new-password"}
                placeholder={"At least 8 characters"}
              />
              <PasswordInput
                label="Confirm password"
                id={"confirm"}
                name="confirm"
                required
                autoComplete={"new-password"}
                placeholder={"Confirm password"}
              />
              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}
              <SubmitButton
                className="w-full"
                size="lg"
                loadingText="Creating…"
              >
                Create account
              </SubmitButton>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
