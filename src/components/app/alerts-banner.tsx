import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

/**
 * Top-of-page banner for critical advisor alerts. Renders only when
 * `runAdvisorChecks` has produced a `severity: "critical"` row that the
 * user hasn't dismissed yet. The full alerts list lives at /alerts; this
 * is the loud "look at me right now" surface for things that genuinely
 * can't wait — runway about to evaporate, a budget 30%+ over, etc.
 */
export function AlertsBanner({
  alerts,
}: {
  alerts: Array<{
    id: number;
    title: string;
    body: string;
    actionUrl: string | null;
  }>;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="rounded-lg border border-destructive/60 bg-destructive/5 px-4 py-3 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="text-sm font-semibold text-destructive">
            {alerts.length === 1
              ? "One thing needs attention"
              : `${alerts.length} things need attention`}
          </div>
          <ul className="space-y-1.5 text-[13px]">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <span className="text-destructive/80 mt-0.5">•</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-muted-foreground">{a.body}</div>
                </div>
                {a.actionUrl ? (
                  <Link
                    href={a.actionUrl}
                    className="text-xs inline-flex items-center gap-0.5 text-destructive hover:underline shrink-0 mt-0.5"
                  >
                    Open <ArrowRight className="size-3" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <Link
            href="/alerts"
            className="inline-flex items-center gap-1 text-xs text-destructive/80 hover:text-destructive"
          >
            See all alerts
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
