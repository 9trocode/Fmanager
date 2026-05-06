"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/format";
import { projectGoal, type GoalLike } from "@/lib/savings";

const config = {
  value: { label: "Goal value", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function SavingsProjectionChart({
  goal,
  currency,
}: {
  goal: GoalLike;
  currency: string;
}) {
  const points = projectGoal(goal);
  return (
    <ChartContainer config={config} className="h-[260px] w-full">
      <LineChart data={points} margin={{ left: 8, right: 16, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          tickFormatter={(v) => `${Math.round(v / 12)}y`}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(v) => formatMoney(Number(v), currency, { compact: true })}
          tickLine={false}
          axisLine={false}
          width={70}
        />
        {goal.targetAmount != null ? (
          <ReferenceLine
            y={goal.targetAmount}
            stroke="var(--color-emerald-500, #10b981)"
            strokeDasharray="4 4"
            label={{
              value: `target ${formatMoney(goal.targetAmount, currency, { compact: true })}`,
              fill: "var(--muted-foreground)",
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
        ) : null}
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) =>
                `Month ${label} (${(Number(label) / 12).toFixed(1)}y)`
              }
              formatter={(value) => [
                formatMoney(Number(value), currency, { compact: true }),
                "Goal value",
              ]}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
