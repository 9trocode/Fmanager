"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  projectNetWorth,
  type ProjectionGrant,
  type ProjectionInputs,
} from "@/lib/projections";
import { formatMoney } from "@/lib/format";

const chartConfig = {
  floor: { label: "Floor", color: "var(--chart-3)" },
  liquid: { label: "Liquid", color: "var(--chart-2)" },
  expected: { label: "Expected", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ProjectionsExplorer({
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  defaultMonthlyContribution,
}: {
  baseCurrency: string;
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  defaultMonthlyContribution?: number;
}) {
  const safeDefaultContribution = Number.isFinite(defaultMonthlyContribution)
    ? (defaultMonthlyContribution as number)
    : 3000;
  const [inputs, setInputs] = useState<ProjectionInputs>({
    monthlyContribution: safeDefaultContribution,
    annualReturnPct: 7,
    horizonMonths: 60,
  });

  const setNumber = (
    key: keyof ProjectionInputs,
    raw: string,
    fallback = 0,
  ) => {
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : fallback;
    setInputs((s) => ({ ...s, [key]: value }));
  };

  const points = useMemo(
    () => projectNetWorth(startNonGrantInBase, grants, fxToBase, inputs),
    [startNonGrantInBase, grants, fxToBase, inputs],
  );

  const last = points[points.length - 1];
  const first = points[0];

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="size-4 text-muted-foreground" />
            Inputs
          </CardTitle>
          <CardDescription>
            Returns apply to non-grant holdings. Equity uses each grant&apos;s
            vesting curve, exit timing, and tax rate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="monthly">
              Monthly contribution ({baseCurrency})
            </Label>
            <Input
              id="monthly"
              type="number"
              step="50"
              value={Number.isFinite(inputs.monthlyContribution) ? inputs.monthlyContribution : ""}
              onChange={(e) => setNumber("monthlyContribution", e.target.value)}
            />
            {defaultMonthlyContribution != null ? (
              <p className="text-[11px] text-muted-foreground">
                Pre-filled from your net cash flow (income − expenses).
                Negative means you&apos;re burning down liquid each month.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rate">Expected blended annual return (%)</Label>
            <Input
              id="rate"
              type="number"
              step="0.5"
              value={Number.isFinite(inputs.annualReturnPct) ? inputs.annualReturnPct : ""}
              onChange={(e) => setNumber("annualReturnPct", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="months">Horizon (months)</Label>
            <Input
              id="months"
              type="number"
              step="6"
              value={Number.isFinite(inputs.horizonMonths) ? inputs.horizonMonths : ""}
              onChange={(e) => setNumber("horizonMonths", e.target.value, 1)}
              min={1}
            />
            <p className="text-[11px] text-muted-foreground">
              {Number.isFinite(inputs.horizonMonths)
                ? `${(inputs.horizonMonths / 12).toFixed(1)} years`
                : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">
            {Number.isFinite(inputs.horizonMonths) && inputs.horizonMonths > 0
              ? `In ${(inputs.horizonMonths / 12).toFixed(1)} years`
              : "Set a horizon"}
          </CardTitle>
          <CardDescription>
            Floor (equity = 0). Liquid (vested × FMV, post-tax). Expected
            (full grant × exit price at exit month, post-tax).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {last && first ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              {(["floor", "liquid", "expected"] as const).map((s) => (
                <div key={s} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full inline-block"
                      style={{ background: `var(--color-${s})` }}
                    />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {chartConfig[s].label}
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-base">
                    {formatMoney(last[s], baseCurrency, { compact: true })}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatMoney(last[s] - first[s], baseCurrency, {
                      compact: true,
                      signed: true,
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <LineChart data={points} margin={{ left: 8, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickFormatter={(v) => `${Math.round(v / 12)}y`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v) =>
                  formatMoney(Number(v), baseCurrency, { compact: true })
                }
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) =>
                      `Month ${label} (${(Number(label) / 12).toFixed(1)}y)`
                    }
                    formatter={(value, name) => [
                      formatMoney(Number(value), baseCurrency, { compact: true }),
                      chartConfig[name as keyof typeof chartConfig]?.label ?? name,
                    ]}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="floor"
                stroke="var(--color-floor)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="liquid"
                stroke="var(--color-liquid)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="expected"
                stroke="var(--color-expected)"
                strokeWidth={2}
                dot={false}
              />
              <ChartLegend content={<ChartLegendContent />} />
            </LineChart>
          </ChartContainer>

          <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">
              Plan against Floor
            </Badge>
            <span>
              Anything above the floor line depends on equity outcomes you don&apos;t
              fully control.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
