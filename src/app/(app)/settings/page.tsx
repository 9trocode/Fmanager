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
  AdvisorModelForm,
  AnthropicKeyForm,
  BaseCurrencyForm,
} from "@/components/app/settings-forms";
import { DecisionsManager } from "@/components/app/decisions-manager";
import { FxRefreshButton } from "@/components/app/fx-refresh-button";
import { AdminDataTools } from "@/components/app/admin-data-tools";
import { getSetting, getSettings, listDecisions } from "@/lib/db/queries";

export default async function SettingsPage() {
  const [settings, decisions, fxLastRefresh] = await Promise.all([
    getSettings(["base_currency", "anthropic_api_key", "advisor_model"]),
    listDecisions(),
    getSetting("fx_last_refresh" as never),
  ]);

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
              <CardTitle className="text-base">Anthropic API key</CardTitle>
              <CardDescription>
                Stored locally in your SQLite DB. Never sent anywhere except Anthropic.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AnthropicKeyForm keySet={!!settings.anthropic_api_key} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advisor model</CardTitle>
              <CardDescription>
                Which Claude model the advisor uses. Sonnet by default.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdvisorModelForm current={settings.advisor_model ?? "claude-sonnet-4-6"} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4">
          <DecisionsManager decisions={decisions} />
        </TabsContent>

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

          <Separator />

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
        </TabsContent>
      </Tabs>
    </>
  );
}
