import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AdvisorKeyForm,
  AdvisorModelForm,
  AdvisorProviderForm,
  BaseCurrencyForm,
} from "@/components/app/settings-forms";
import {
  ADVISOR_PROVIDERS,
  DEFAULT_MODEL,
  PROVIDER_KEY_SETTING,
  type AdvisorProvider,
} from "@/lib/ai/provider";
import { DecisionsManager } from "@/components/app/decisions-manager";
import { FxRefreshButton } from "@/components/app/fx-refresh-button";
import { SecuritySettings } from "@/components/app/security-settings";
import { AdminDataTools } from "@/components/app/admin-data-tools";
import { DataTools } from "@/components/app/data-tools";
import { MembersManager } from "@/components/app/members-manager";
import { StatementExport } from "@/components/app/statement-export";
import { getSetting, getSettings, listDecisions } from "@/lib/db/queries";
import { listActiveInvites, listUsers } from "@/lib/db/users";
import { getAdminProfile, getCurrentUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const [
    settings,
    decisions,
    fxLastRefresh,
    idleMinutesRaw,
    panicUrl,
    registrationModeRaw,
    members,
    invites,
    ownerProfile,
  ] = await Promise.all([
    getSettings([
      "base_currency",
      "advisor_provider",
      "advisor_model",
      "anthropic_api_key",
      "openai_api_key",
      "google_api_key",
    ]),
    listDecisions(),
    getSetting("fx_last_refresh"),
    getSetting("screen_lock_timeout_minutes"),
    getSetting("panic_redirect_url"),
    getSetting("registration_mode"),
    listUsers(),
    listActiveInvites(),
    getAdminProfile(),
  ]);
  // Isolated tenants are admins of their own silo only — they shouldn't
  // see the host's Members panel or sample-data tools.
  const currentUser = await getCurrentUser();
  const isHost = !currentUser || currentUser.dataScope === "shared";
  const registrationMode: "closed" | "invite" | "open" =
    registrationModeRaw === "invite" || registrationModeRaw === "open"
      ? registrationModeRaw
      : "closed";
  const idleMinutes = Number(idleMinutesRaw) || 0;

  const provider = ((settings.advisor_provider as string) ??
    "anthropic") as AdvisorProvider;
  const keysSet: Record<AdvisorProvider, boolean> = {
    anthropic: Boolean(settings[PROVIDER_KEY_SETTING.anthropic]),
    openai: Boolean(settings[PROVIDER_KEY_SETTING.openai]),
    google: Boolean(settings[PROVIDER_KEY_SETTING.google]),
  };
  const activeKeySet = keysSet[provider];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Base currency, advisor key, decisions, and admin."
      />

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="advisor">Advisor</TabsTrigger>
          <TabsTrigger value="decisions">
            Decisions
            <span className="ml-1.5 text-[10px] font-mono bg-secondary px-1.5 rounded">
              {decisions.filter((d) => d.status === "open").length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {isHost ? (
            <TabsTrigger value="members">
              Members
              {members.length > 0 ? (
                <span className="ml-1.5 text-[10px] font-mono bg-secondary px-1.5 rounded">
                  {members.length + 1}
                </span>
              ) : null}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Base currency</CardTitle>
              <CardDescription>
                The currency net worth and projections are reported in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BaseCurrencyForm current={settings.base_currency ?? "USD"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">FX rates</CardTitle>
              <CardDescription>
                Free provider (open.er-api.com). Refresh manually; rates are cached for
                12 hours otherwise.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <FxRefreshButton base={settings.base_currency ?? "USD"} />
              {fxLastRefresh ? (
                <span className="text-xs text-muted-foreground font-mono">
                  last: {new Date(fxLastRefresh).toLocaleString()}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  never refreshed — using fallback rates
                </span>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advisor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">AI provider</CardTitle>
              <CardDescription>
                Pick which model family powers the advisor, receipt scan, and
                voice parsing. Each provider needs its own API key (BYO).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdvisorProviderForm current={provider} keysSet={keysSet} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {provider === "anthropic"
                  ? "Anthropic"
                  : provider === "openai"
                    ? "OpenAI"
                    : "Google"}{" "}
                API key
              </CardTitle>
              <CardDescription>
                Stored locally in your SQLite DB. Never sent anywhere except
                directly to the provider.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdvisorKeyForm provider={provider} keySet={activeKeySet} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advisor model</CardTitle>
              <CardDescription>
                Which model the advisor uses, within the selected provider.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdvisorModelForm
                current={settings.advisor_model ?? DEFAULT_MODEL[provider]}
                provider={provider}
              />
            </CardContent>
          </Card>

          {ADVISOR_PROVIDERS.filter((p) => p !== provider && keysSet[p]).length >
          0 ? (
            <p className="text-xs text-muted-foreground">
              Other providers with stored keys:{" "}
              {ADVISOR_PROVIDERS.filter(
                (p) => p !== provider && keysSet[p],
              ).join(", ")}
              . You can switch back any time.
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4">
          <DecisionsManager decisions={decisions} />
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <SecuritySettings
            initialIdleMinutes={idleMinutes}
            initialPanicUrl={panicUrl ?? ""}
          />
        </TabsContent>

        {isHost ? (
          <TabsContent value="members" className="space-y-4">
            <MembersManager
              mode={registrationMode}
              users={members}
              invites={invites}
              ownerEmail={ownerProfile.email}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="admin" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Session</CardTitle>
              <CardDescription>Sign out of this browser.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action="/api/auth/logout" method="post">
                <Button type="submit" variant="outline">
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </form>
            </CardContent>
          </Card>

          {isHost ? (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sharing read-only access</CardTitle>
                  <CardDescription>
                    Let a partner or co-founder view your numbers without giving them
                    edit rights.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  {process.env.VIEWER_PASSWORD ? (
                    <>
                      <p>
                        <span className="inline-block size-2 rounded-full bg-emerald-500 mr-2 align-middle" />
                        Viewer access is <span className="text-foreground font-medium">enabled</span>.
                      </p>
                      <p>
                        Share the password from <code className="font-mono">VIEWER_PASSWORD</code>{" "}
                        with whoever you want to grant read-only access. They sign in at{" "}
                        <code className="font-mono">/login</code> like you do. Viewers see
                        every page but cannot create, edit, or delete anything.
                      </p>
                    </>
                  ) : (
                    <>
                      <p>
                        <span className="inline-block size-2 rounded-full bg-muted-foreground/40 mr-2 align-middle" />
                        Viewer access is <span className="text-foreground font-medium">disabled</span>.
                      </p>
                      <p>
                        Set <code className="font-mono">VIEWER_PASSWORD</code> in your
                        environment to enable read-only sharing. Restart the app after
                        setting it.
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}

          <Separator />

          <StatementExport baseCurrency={settings.base_currency ?? "USD"} />

          {isHost ? (
            <>
              <Separator />
              <DataTools />
              <Separator />
            </>
          ) : (
            <Separator />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sample data</CardTitle>
              <CardDescription>
                Quickly populate a realistic founder dataset (multi-currency
                accounts, three equity grants, three active decisions) — useful for
                kicking the tires before entering your real numbers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminDataTools />
            </CardContent>
          </Card>

          {isHost ? (
            <>
              <Separator />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Database</CardTitle>
                  <CardDescription>
                    Data lives in <code className="font-mono">./data/app.db</code>. Back it up
                    yourself — that&apos;s the entire point of self-hosting.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground font-mono">
                  {process.env.DATABASE_URL ?? "./data/app.db"}
                </CardContent>
              </Card>
            </>
          ) : null}
        </TabsContent>
      </Tabs>
    </>
  );
}
