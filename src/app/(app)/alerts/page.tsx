import Link from "next/link";
import { AlertTriangle, BellOff, Info, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/app/submit-button";
import {
  listActiveAlerts,
  listAlertsInMonth,
  listRecentAlerts,
} from "@/lib/advisor-alerts";
import { dismissAlert, dismissAllAlerts } from "@/lib/actions/alerts";
import { resolveMonthKey } from "@/lib/month-filter";
import type { AlertSeverity } from "@/lib/db/schema";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const params = await searchParams;
  const selectedMonth = await resolveMonthKey(params.m);
  const today = currentMonthKey();
  const isPastMonth = selectedMonth != null && selectedMonth !== today;

  // Branch: past-month view shows EVERY alert that fired in that
  // month (regardless of current dismissed/resolved state) so the
  // user can see what happened then. Current-month view shows the
  // live active set + recent history below — the original behavior.
  if (isPastMonth) {
    const monthAlerts = await listAlertsInMonth(selectedMonth!);
    return (
      <>
        <PageHeader
          title="Alerts"
          description={`Showing alerts raised during ${monthLabel(selectedMonth!)}. Filter is set in the sidebar — pick "this month" to switch back to live alerts.`}
          actions={
            <Badge variant="outline" className="font-mono text-[11px]">
              {monthLabel(selectedMonth!)}
            </Badge>
          }
        />
        {monthAlerts.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Nothing fired in {monthLabel(selectedMonth!)}
              </CardTitle>
              <CardDescription>
                No runway / budget / goal alerts were raised during this
                month. Switch back to the current month in the sidebar
                to see live alerts.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="space-y-3">
            {monthAlerts.map((a) => (
              <AlertRow
                key={a.id}
                id={a.id}
                severity={a.severity as AlertSeverity}
                title={a.title}
                body={a.body}
                actionUrl={a.actionUrl}
                createdAt={a.createdAt}
                dismissedAt={a.dismissedAt}
                resolvedAt={a.resolvedAt}
                historical
              />
            ))}
          </div>
        )}
      </>
    );
  }

  // Current month: live view + recently-resolved history.
  const [active, recent] = await Promise.all([
    listActiveAlerts(),
    listRecentAlerts(50),
  ]);
  // History = recent, minus the active set, capped to 25 most recent.
  const activeIds = new Set(active.map((a) => a.id));
  const history = recent.filter((a) => !activeIds.has(a.id)).slice(0, 25);

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Things the advisor wants your attention on. Generated automatically; dismiss when handled."
        actions={
          active.length > 0 ? (
            <form action={dismissAllAlerts}>
              <SubmitButton variant="outline" size="sm">
                <BellOff className="size-4" />
                Dismiss all
              </SubmitButton>
            </form>
          ) : undefined
        }
      />

      {active.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nothing to flag</CardTitle>
            <CardDescription>
              Runway is healthy, budgets are within their caps, and no goal is
              off-pace. The advisor checks every 30 minutes — anything new will
              appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {active.map((a) => (
            <AlertRow
              key={a.id}
              id={a.id}
              severity={a.severity as AlertSeverity}
              title={a.title}
              body={a.body}
              actionUrl={a.actionUrl}
              createdAt={a.createdAt}
            />
          ))}
        </div>
      )}

      {history.length > 0 ? (
        <div className="mt-10 space-y-2">
          <div className="text-[11px] uppercase tracking-[0.08em] font-medium text-muted-foreground/70 px-1">
            Recently resolved / dismissed
          </div>
          {history.map((a) => (
            <div
              key={a.id}
              className="flex items-start gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground border border-border/40"
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{a.title}</div>
                <div className="text-[11px] font-mono">
                  {new Date(a.createdAt).toLocaleString()} ·{" "}
                  {a.dismissedAt
                    ? "dismissed"
                    : a.resolvedAt
                      ? "resolved"
                      : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

function AlertRow({
  id,
  severity,
  title,
  body,
  actionUrl,
  createdAt,
  dismissedAt,
  resolvedAt,
  historical,
}: {
  id: number;
  severity: AlertSeverity;
  title: string;
  body: string;
  actionUrl: string | null;
  createdAt: string;
  dismissedAt?: string | null;
  resolvedAt?: string | null;
  /**
   * When true, render the row in a "historical" mode — no Dismiss
   * button (already in the past), but show the eventual resolution
   * tag (dismissed / resolved / still active) so the user can see
   * how the situation played out.
   */
  historical?: boolean;
}) {
  const tone =
    severity === "critical"
      ? {
          icon: AlertTriangle,
          ring: "border-destructive/60 bg-destructive/5",
          accent: "text-destructive",
        }
      : severity === "warning"
        ? {
            icon: AlertTriangle,
            ring: "border-amber-500/40 bg-amber-500/5",
            accent: "text-amber-600 dark:text-amber-500",
          }
        : {
            icon: Info,
            ring: "border-border bg-secondary/30",
            accent: "text-muted-foreground",
          };
  const Icon = tone.icon;
  const eventualState = dismissedAt
    ? "dismissed"
    : resolvedAt
      ? "resolved"
      : "still active";
  return (
    <div
      className={`relative rounded-lg border ${tone.ring} px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-start ${historical ? "opacity-90" : ""}`}
    >
      <Icon className={`size-5 shrink-0 mt-0.5 ${tone.accent}`} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-sm font-medium leading-tight flex items-center gap-2 flex-wrap">
          {title}
          {historical ? (
            <Badge variant="outline" className="text-[10px]">
              {eventualState}
            </Badge>
          ) : null}
        </div>
        <div className="text-[13px] text-muted-foreground leading-snug">
          {body}
        </div>
        <div className="text-[11px] font-mono text-muted-foreground">
          {new Date(createdAt).toLocaleString()}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {actionUrl ? (
          <Button asChild variant="outline" size="sm">
            <Link href={actionUrl}>
              View
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        ) : null}
        {!historical ? (
          <form action={dismissAlert}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="ghost" size="sm">
              Dismiss
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
