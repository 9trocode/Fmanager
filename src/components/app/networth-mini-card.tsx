import Link from "next/link";
import { ArrowRight, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { NetWorthSummary } from "@/lib/aggregation";

export function NetWorthMiniCard({ summary }: { summary: NetWorthSummary }) {
  const baseCurrency = summary.baseCurrency;
  const floor = summary.totals.floor;
  const liquid = summary.totals.liquid;
  const expected = summary.totals.expected;
  const equityUpsideLiquid = liquid - floor;
  const equityUpsideExpected = expected - floor;
  // No equity grants → all three scenarios collapse to the same number.
  // Showing three identical columns with "+0 paper" / "+0 if it works out"
  // is noise; render a single net-worth view instead. Round-down to 0.5
  // unit gives us a stable "effectively zero" check that survives FX
  // dust from cross-currency conversions.
  const hasEquityUpside =
    Math.abs(equityUpsideLiquid) > 0.5 || Math.abs(equityUpsideExpected) > 0.5;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              {hasEquityUpside ? "Total net worth" : "Net worth"}
            </CardTitle>
            <CardDescription>
              {hasEquityUpside
                ? "Your full balance sheet, with company equity treated honestly."
                : "Your full balance sheet today. Add an equity grant on /equity to see the upside scenarios."}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs shrink-0">
            <Link href="/net-worth">
              See breakdown <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      {hasEquityUpside ? (
        <CardContent className="border-t border-border pt-4 grid md:grid-cols-3 gap-4">
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Without company equity
            </div>
            <div className="font-mono tabular-nums text-2xl">
              {formatMoney(floor, baseCurrency, { compact: true })}
            </div>
            <div className="text-[10px] text-muted-foreground">
              What you actually have today.
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              + Equity at today&apos;s value
            </div>
            <div className="font-mono tabular-nums text-base text-muted-foreground">
              {formatMoney(liquid, baseCurrency, { compact: true })}
            </div>
            <div className="text-[10px] text-muted-foreground">
              +{formatMoney(equityUpsideLiquid, baseCurrency, { compact: true })}{" "}
              paper.
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              + Equity at target exit
            </div>
            <div className="font-mono tabular-nums text-base text-muted-foreground">
              {formatMoney(expected, baseCurrency, { compact: true })}
            </div>
            <div className="text-[10px] text-muted-foreground">
              +{formatMoney(equityUpsideExpected, baseCurrency, { compact: true })}{" "}
              if it works out.
            </div>
          </div>
        </CardContent>
      ) : (
        <CardContent className="border-t border-border pt-4">
          <div
            className={
              "font-mono tabular-nums text-3xl " +
              (floor < 0 ? "text-destructive" : "")
            }
          >
            {formatMoney(floor, baseCurrency, { compact: true })}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {floor < 0
              ? "Liabilities exceed assets right now. Pull down the breakdown to see why."
              : "Cash + investments minus loans. No company equity tracked yet."}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
