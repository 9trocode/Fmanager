import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  authDisabled,
  createSession,
  isAuthenticated,
  verifyPassword,
} from "@/lib/auth/session";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!verifyPassword(password)) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  await createSession();
  redirect(next || "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  if (await isAuthenticated()) redirect("/");

  const params = await searchParams;
  const hasError = params.error === "1";
  const next = params.next ?? "/";

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1.5">
          <div className="size-9 rounded-md bg-primary text-primary-foreground grid place-items-center text-base font-semibold mx-auto">
            ƒ
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Founder Finance</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your self-hosted instance.
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Admin sign-in</CardTitle>
            <CardDescription>
              {authDisabled()
                ? "No admin password set — enter anything to continue."
                : "Enter the password from your ADMIN_PASSWORD env var."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={login} className="space-y-4">
              <input type="hidden" name="next" value={next} />
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  required={!authDisabled()}
                />
              </div>
              {hasError ? (
                <Alert variant="destructive">
                  <AlertDescription>Incorrect password.</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="w-full">
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
