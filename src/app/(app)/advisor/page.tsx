import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listDecisions } from "@/lib/db/queries";
import {
  getAdvisorProvider,
  isAdvisorConfigured,
  PROVIDER_LABEL,
} from "@/lib/ai/provider";
import { getChatSession, listChatSessions } from "@/lib/actions/chat";
import { AdvisorChat } from "./advisor-chat";

export const dynamic = "force-dynamic";

export default async function AdvisorPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const params = await searchParams;
  const requestedSessionId = Number(params.s);
  const validRequested = Number.isFinite(requestedSessionId)
    ? requestedSessionId
    : null;

  const [decisions, provider, configured, sessions] = await Promise.all([
    listDecisions({ onlyOpen: true }),
    getAdvisorProvider(),
    isAdvisorConfigured(),
    listChatSessions(),
  ]);
  const providerName = PROVIDER_LABEL[provider].split(" ")[0];

  // Pick the session: explicit query param, else the most-recent, else
  // null (a fresh session is auto-created on first user send).
  const activeSessionId = validRequested ?? sessions[0]?.id ?? null;
  const activeSession =
    activeSessionId != null ? await getChatSession(activeSessionId) : null;

  return (
    <>
      <PageHeader
        title="Advisor"
        description="A finance co-pilot anchored on your three real decisions and your full balance sheet."
        actions={
          <Badge variant={configured ? "secondary" : "outline"}>
            {configured
              ? `BYO ${providerName} key configured`
              : `Add ${providerName} key in Settings`}
          </Badge>
        }
      />

      {/*
        Sized so the chat dominates on desktop while still leaving the
        decisions sidebar comfortably visible. Min keeps it usable on
        smaller laptops; the calc lets it grow with the viewport so a
        long conversation has room to breathe instead of fighting an
        artificial ~640px ceiling.
      */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col min-h-[680px] h-[calc(100vh-12rem)]">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              Chat
            </CardTitle>
            <CardDescription>
              The advisor sees your accounts, equity, and active decisions — not raw
              balances unless you ask.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <AdvisorChat
              sessionId={activeSessionId}
              initialMessages={activeSession?.messages ?? []}
              sessions={sessions}
            />
          </CardContent>
        </Card>

        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active decisions</CardTitle>
              <CardDescription>
                The advisor anchors on these.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {decisions.length === 0 ? (
                <div className="text-sm text-muted-foreground space-y-3">
                  <p>No active decisions.</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/settings?tab=decisions">
                      Add decisions <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              ) : (
                decisions.map((d, i) => (
                  <div
                    key={d.id}
                    className="text-sm leading-snug pl-3 border-l-2 border-primary/40"
                  >
                    <div className="text-[11px] text-muted-foreground font-mono mb-1">
                      decision {i + 1}
                    </div>
                    {d.question}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
