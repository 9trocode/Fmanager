import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdvisorChat } from "./advisor-chat";

export default function AdvisorPage() {
  return (
    <>
      <PageHeader
        title="Advisor"
        description="A finance co-pilot anchored on your three real decisions and your full balance sheet."
        actions={<Badge variant="secondary">BYO Anthropic key</Badge>}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 h-[640px] flex flex-col">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              Chat
            </CardTitle>
            <CardDescription>
              The advisor sees your accounts, equity, and active decisions — not your raw
              balances unless you ask.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <AdvisorChat />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Your decisions</CardTitle>
            <CardDescription>
              The advisor anchors on these. Add yours in Settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            No decisions yet.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
