import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Base currency, AI key, decisions, and admin."
      />

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="advisor">Advisor</TabsTrigger>
          <TabsTrigger value="decisions">Decisions</TabsTrigger>
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
            <CardContent className="space-y-3">
              <div className="space-y-1.5 max-w-xs">
                <Label htmlFor="base">Currency</Label>
                <Input id="base" placeholder="USD" defaultValue="USD" />
              </div>
              <Button>Save</Button>
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
            <CardContent className="space-y-3">
              <div className="space-y-1.5 max-w-md">
                <Label htmlFor="key">API key</Label>
                <Input id="key" type="password" placeholder="sk-ant-..." />
              </div>
              <Button>Save</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="decisions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active decisions</CardTitle>
              <CardDescription>
                The 3 financial decisions you&apos;re trying to make right now. The advisor
                anchors on these.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Decisions UI coming soon.
            </CardContent>
          </Card>
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
