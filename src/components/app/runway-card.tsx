import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { RunwaySummary } from "@/lib/aggregation";

function classify(months: number | null) {
  if (months == null) return { label: "—", tone: "neutral" as const };
  if (months < 6) return { label: "Tight", tone: "critical" as const };
  if (months < 12) return { label: "OK", tone: "warn" as const };
  if (months < 18) return { label: "Comfortable", tone: "ok" as const };
  return { label: "Strong", tone: "good" as const };
}

const TONE_STYLES = {
  neutral: "text-muted-foreground",
  critical: "text-destructive",
  warn: "text-amber-300",
  ok: "text-foreground",
  good: "text-emerald-300",
};

export function RunwayCard({ runway }: { runway: RunwaySummary }) {
  if (runway.monthlyExpenses === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardDescription className="flex items-center gap-2">
              <ShieldCheck className="size-3.5" />
              Months covered
            </CardDescription>
            <Badge variant="outline" className="text-[10px]">
              no expenses
            </Badge>
          </div>
          <CardTitle className="text-3xl font-mono tracking-tight mt-1 text-muted-foreground">
            —
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t border-border pt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/cash-flow">
              Add recurring expenses <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const months = runway.monthsRunway;
  const { label, tone } = classify(months);
  const monthsText =
    months == null
      ? "∞"
      : months >= 60
        ? `${(months / 12).toFixed(0)}+ y`
        : `${months.toFixed(1)} mo`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription className="flex items-center gap-2">
            <ShieldCheck className="size-3.5" />
            Months covered
          </CardDescription>
          <Badge
            variant={tone === "critical" ? "destructive" : "secondary"}
            className="text-[10px]"
          >
            {label}
          </Badge>
        </div>
        <CardTitle
          className={`text-3xl font-mono tracking-tight mt-1 ${TONE_STYLES[tone]}`}
        >
          {monthsText}
        </CardTitle>
        <CardDescription className="font-mono text-[11px]">
          {formatMoney(runway.liquidCash, runway.baseCurrency, { compact: true })}{" "}
          liquid covers{" "}
          {formatMoney(runway.monthlyExpenses, runway.baseCurrency, { compact: true })}
          /mo of expenses
        </CardDescription>
      </CardHeader>
      <CardContent className="border-t border-border pt-3 space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Income
            </div>
            <div className="font-mono tabular-nums text-emerald-300">
              {formatMoney(runway.monthlyIncome, runway.baseCurrency, { compact: true })}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Net / mo
            </div>
            <div
              className={
                "font-mono tabular-nums " +
                (runway.netMonthly >= 0 ? "text-emerald-300" : "text-destructive")
              }
            >
              {formatMoney(runway.netMonthly, runway.baseCurrency, {
                compact: true,
                signed: true,
              })}
            </div>
          </div>
        </div>
        {runway.monthsNetRunway != null &&
        runway.monthsRunway != null &&
        runway.monthsNetRunway > runway.monthsRunway ? (
          <p className="text-[11px] text-muted-foreground leading-snug">
            With income factored in, coverage extends to{" "}
            <span className="font-mono tabular-nums">
              {runway.monthsNetRunway >= 60
                ? `${(runway.monthsNetRunway / 12).toFixed(0)}+ y`
                : `${runway.monthsNetRunway.toFixed(1)} mo`}
            </span>
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
