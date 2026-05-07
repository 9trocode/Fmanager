"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import {
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoneyInput } from "@/components/app/money-input";
import {
  firstMonthCrossing,
  projectMultiScenario,
  type NamedScenario,
  type ProjectionGrant,
  type ScenarioEvent,
} from "@/lib/projections";
import {
  suggestScenarios,
  type SuggestedScenario,
} from "@/lib/actions/projections";
import type { Scenario as EquityScenario } from "@/lib/scenarios";
import { formatMoney } from "@/lib/format";

export type ProjectionGoal = {
  id: number;
  name: string;
  kind: string;
  targetAmount: number | null;
  /** Target converted into the page's base currency, so the chart line is comparable. */
  targetInBase: number | null;
  /** Months until goal.targetDate (null when no target date set). */
  monthsToTarget: number | null;
};

const PALETTE = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const;

const VIEW_LABEL: Record<EquityScenario, string> = {
  floor: "Floor (equity = 0)",
  liquid: "Liquid (today's FMV)",
  expected: "Expected (target exit)",
};

const VIEW_TIP: Record<EquityScenario, string> = {
  floor: "Plan against this. Equity assumed worthless.",
  liquid: "Equity at current 409A / FMV.",
  expected: "Equity at target exit price.",
};

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

function makeBaseScenario(
  name: string,
  defaults: { monthly: number; returnPct?: number; horizon?: number },
): NamedScenario {
  return {
    id: uid(),
    name,
    inputs: {
      monthlyContribution: defaults.monthly,
      annualReturnPct: defaults.returnPct ?? 7,
      horizonMonths: defaults.horizon ?? 60,
      events: [],
    },
  };
}

export function ProjectionsExplorer({
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  defaultMonthlyContribution,
  goals,
}: {
  baseCurrency: string;
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  defaultMonthlyContribution?: number;
  goals: ProjectionGoal[];
}) {
  const safeDefault = Number.isFinite(defaultMonthlyContribution)
    ? (defaultMonthlyContribution as number)
    : 3000;

  // Always-on baseline scenario + room for what-if siblings. The user
  // can rename the baseline; they can't remove the last scenario.
  const [scenarios, setScenarios] = useState<NamedScenario[]>(() => [
    makeBaseScenario("Current pace", { monthly: safeDefault }),
  ]);
  const [view, setView] = useState<EquityScenario>("floor");
  const [goalId, setGoalId] = useState<number | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, startAi] = useTransition();

  const selectedGoal = goalId != null
    ? (goals.find((g) => g.id === goalId) ?? null)
    : null;
  const goalTargetInBase = selectedGoal?.targetInBase ?? null;

  const { points, byScenario, maxMonth } = useMemo(
    () =>
      projectMultiScenario(
        startNonGrantInBase,
        grants,
        fxToBase,
        scenarios,
        view,
      ),
    [startNonGrantInBase, grants, fxToBase, scenarios, view],
  );

  const chartConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    scenarios.forEach((s, i) => {
      cfg[s.id] = {
        label: s.name,
        color: `var(--${PALETTE[i % PALETTE.length]})`,
      };
    });
    return cfg;
  }, [scenarios]);

  const etaByScenario = useMemo(() => {
    if (goalTargetInBase == null) return {} as Record<string, number | null>;
    const out: Record<string, number | null> = {};
    for (const s of scenarios) {
      const series = byScenario[s.id];
      out[s.id] = series ? firstMonthCrossing(series, goalTargetInBase, view) : null;
    }
    return out;
  }, [byScenario, scenarios, goalTargetInBase, view]);

  function addScenario() {
    setScenarios((prev) => [
      ...prev,
      makeBaseScenario(`Scenario ${prev.length + 1}`, { monthly: safeDefault }),
    ]);
  }

  function duplicateScenario(id: string) {
    setScenarios((prev) => {
      const src = prev.find((s) => s.id === id);
      if (!src) return prev;
      return [
        ...prev,
        {
          id: uid(),
          name: `${src.name} (copy)`,
          inputs: {
            ...src.inputs,
            events: [...(src.inputs.events ?? [])],
          },
        },
      ];
    });
  }

  function removeScenario(id: string) {
    setScenarios((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }

  function updateScenario(id: string, patch: Partial<NamedScenario["inputs"]> & { name?: string }) {
    setScenarios((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              name: patch.name ?? s.name,
              inputs: {
                ...s.inputs,
                ...(patch.monthlyContribution !== undefined
                  ? { monthlyContribution: patch.monthlyContribution }
                  : {}),
                ...(patch.annualReturnPct !== undefined
                  ? { annualReturnPct: patch.annualReturnPct }
                  : {}),
                ...(patch.horizonMonths !== undefined
                  ? { horizonMonths: patch.horizonMonths }
                  : {}),
                ...(patch.events !== undefined ? { events: patch.events } : {}),
              },
            }
          : s,
      ),
    );
  }

  function applySuggestions(suggestions: SuggestedScenario[]) {
    // Prepend so the user sees the new ones immediately at the top.
    const made: NamedScenario[] = suggestions.map((s) => ({
      id: uid(),
      name: s.name,
      inputs: {
        monthlyContribution: s.monthlyContribution,
        annualReturnPct: s.annualReturnPct,
        horizonMonths: s.horizonMonths,
        events: s.events,
      },
    }));
    setScenarios((prev) => [...prev, ...made]);
  }

  function handleAiSuggest() {
    startAi(async () => {
      const result = await suggestScenarios(aiPrompt, goalId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      applySuggestions(result.scenarios);
      setAiOpen(false);
      setAiPrompt("");
      toast.success(`Added ${result.scenarios.length} scenario${result.scenarios.length === 1 ? "" : "s"}.`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">View</Label>
            <Select value={view} onValueChange={(v) => setView(v as EquityScenario)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["floor", "liquid", "expected"] as const).map((v) => (
                  <SelectItem key={v} value={v}>
                    {VIEW_LABEL[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">{VIEW_TIP[view]}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Goal target</Label>
            <Select
              value={goalId == null ? "none" : String(goalId)}
              onValueChange={(v) => setGoalId(v === "none" ? null : Number(v))}
            >
              <SelectTrigger className="w-[260px]">
                <SelectValue placeholder="No target" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No target</SelectItem>
                {goals.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>
                    {g.name}
                    {g.targetInBase != null
                      ? ` · ${formatMoney(g.targetInBase, baseCurrency, { compact: true })}`
                      : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Draws a target line and per-scenario ETA.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addScenario}>
            <Plus className="size-4" /> Scenario
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setAiOpen((o) => !o)}
          >
            <Sparkles className="size-4" /> AI scenarios
          </Button>
        </div>
      </div>

      {aiOpen ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Generate scenarios
            </CardTitle>
            <CardDescription>
              Describe what you want to model — a raise in 6 months, cutting
              dining 50%, a year-end bonus, the gap to a goal. The advisor
              uses your real numbers and the selected goal as anchors.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. I'm getting a 30% raise in 4 months and want to see how fast I can hit the emergency fund goal."
              rows={3}
              disabled={aiBusy}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[80px]"
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAiOpen(false)}
                disabled={aiBusy}
              >
                Cancel
              </Button>
              <Button onClick={handleAiSuggest} disabled={aiBusy} size="sm">
                <Zap className="size-4" />
                {aiBusy ? "Generating…" : "Generate"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          {scenarios.map((s, i) => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              colorVar={`var(--${PALETTE[i % PALETTE.length]})`}
              baseCurrency={baseCurrency}
              etaMonths={etaByScenario[s.id] ?? null}
              canDelete={scenarios.length > 1}
              onUpdate={(patch) => updateScenario(s.id, patch)}
              onDuplicate={() => duplicateScenario(s.id)}
              onDelete={() => removeScenario(s.id)}
            />
          ))}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-muted-foreground" />
              Scenarios at a glance
            </CardTitle>
            <CardDescription>
              {scenarios.length === 1
                ? "Add another scenario to compare. Use AI scenarios to seed a few good options."
                : `Comparing ${scenarios.length} paths over ${(maxMonth / 12).toFixed(1)} years.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <LineChart data={points} margin={{ left: 8, right: 16, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickFormatter={(v) => `${Math.round(Number(v) / 12)}y`}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(v) =>
                    formatMoney(Number(v), baseCurrency, { compact: true })
                  }
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) =>
                        `Month ${label} (${(Number(label) / 12).toFixed(1)}y)`
                      }
                      formatter={(value, name) => [
                        formatMoney(Number(value), baseCurrency, { compact: true }),
                        chartConfig[name as string]?.label ?? String(name),
                      ]}
                    />
                  }
                />
                {goalTargetInBase != null ? (
                  <ReferenceLine
                    y={goalTargetInBase}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.7}
                    label={{
                      value: `Target: ${formatMoney(goalTargetInBase, baseCurrency, { compact: true })}`,
                      position: "insideTopRight",
                      fontSize: 10,
                      fill: "var(--muted-foreground)",
                    }}
                  />
                ) : null}
                {scenarios.map((s) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.id}
                    stroke={`var(--color-${s.id})`}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                ))}
                <ChartLegend content={<ChartLegendContent />} />
              </LineChart>
            </ChartContainer>

            {goalTargetInBase != null ? (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {scenarios.map((s, i) => {
                  const eta = etaByScenario[s.id];
                  return (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
                    >
                      <span
                        className="size-2 rounded-full inline-block shrink-0"
                        style={{
                          background: `var(--${PALETTE[i % PALETTE.length]})`,
                        }}
                      />
                      <span className="truncate flex-1 min-w-0">{s.name}</span>
                      <span className="font-mono tabular-nums shrink-0">
                        {eta == null
                          ? "—"
                          : eta === 0
                            ? "now"
                            : `${eta}mo`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                Plan against {VIEW_LABEL[view]}
              </Badge>
              <span>Lines stop after each scenario&apos;s horizon.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScenarioCard({
  scenario,
  colorVar,
  baseCurrency,
  etaMonths,
  canDelete,
  onUpdate,
  onDuplicate,
  onDelete,
}: {
  scenario: NamedScenario;
  colorVar: string;
  baseCurrency: string;
  etaMonths: number | null;
  canDelete: boolean;
  onUpdate: (patch: Partial<NamedScenario["inputs"]> & { name?: string }) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);
  const events = scenario.inputs.events ?? [];

  function patchEvents(next: ScenarioEvent[]) {
    onUpdate({ events: next });
  }

  function addEvent(kind: ScenarioEvent["kind"]) {
    const base: ScenarioEvent =
      kind === "lump_sum"
        ? { kind: "lump_sum", atMonth: 6, amount: 0 }
        : kind === "expense_shock"
          ? {
              kind: "expense_shock",
              atMonth: 6,
              newMonthly: scenario.inputs.monthlyContribution - 100,
            }
          : {
              kind: "raise",
              atMonth: 6,
              newMonthly: scenario.inputs.monthlyContribution + 100,
            };
    patchEvents([...events, base]);
  }

  return (
    <div
      className="rounded-lg border border-border bg-card overflow-hidden"
      style={{ borderLeftWidth: 4, borderLeftColor: colorVar }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-secondary/40 transition-colors"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          value={scenario.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium focus:outline-none"
          aria-label="Scenario name"
        />
        {etaMonths != null ? (
          <Badge variant="secondary" className="text-[10px] shrink-0 font-mono">
            ETA {etaMonths}mo
          </Badge>
        ) : null}
      </button>
      {open ? (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50">
          <div className="grid grid-cols-2 gap-2 pt-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Monthly contribution ({baseCurrency})
              </Label>
              <MoneyInput
                allowNegative
                value={
                  Number.isFinite(scenario.inputs.monthlyContribution)
                    ? scenario.inputs.monthlyContribution
                    : null
                }
                onValueChange={(n) =>
                  onUpdate({ monthlyContribution: n ?? 0 })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Return %/yr
              </Label>
              <Input
                type="number"
                step="0.5"
                value={
                  Number.isFinite(scenario.inputs.annualReturnPct)
                    ? scenario.inputs.annualReturnPct
                    : ""
                }
                onChange={(e) =>
                  onUpdate({
                    annualReturnPct: Number(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                Horizon (mo)
              </Label>
              <Input
                type="number"
                step="6"
                min={1}
                value={
                  Number.isFinite(scenario.inputs.horizonMonths)
                    ? scenario.inputs.horizonMonths
                    : ""
                }
                onChange={(e) =>
                  onUpdate({
                    horizonMonths: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </div>
          </div>

          {events.length > 0 ? (
            <div className="space-y-2">
              <Label className="text-[11px] text-muted-foreground">
                Mid-stream events
              </Label>
              {events.map((e, idx) => (
                <EventRow
                  key={idx}
                  event={e}
                  baseCurrency={baseCurrency}
                  onChange={(next) => {
                    const copy = events.slice();
                    copy[idx] = next;
                    patchEvents(copy);
                  }}
                  onRemove={() =>
                    patchEvents(events.filter((_, i) => i !== idx))
                  }
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground mr-1">
              Add event:
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => addEvent("raise")}
            >
              + Raise
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => addEvent("expense_shock")}
            >
              + Expense shock
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => addEvent("lump_sum")}
            >
              + Lump sum
            </Button>
          </div>

          <div className="flex items-center justify-end gap-1 pt-1">
            <Button variant="ghost" size="xs" onClick={onDuplicate}>
              Duplicate
            </Button>
            {canDelete ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EventRow({
  event,
  baseCurrency,
  onChange,
  onRemove,
}: {
  event: ScenarioEvent;
  baseCurrency: string;
  onChange: (next: ScenarioEvent) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-secondary/30 px-2 py-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Select
          value={event.kind}
          onValueChange={(v) => {
            // Re-shape the discriminant when the user changes kind.
            if (v === "lump_sum") {
              onChange({
                kind: "lump_sum",
                atMonth: event.atMonth,
                amount:
                  "amount" in event ? event.amount : 0,
                label: event.label,
              });
            } else if (v === "expense_shock") {
              onChange({
                kind: "expense_shock",
                atMonth: event.atMonth,
                newMonthly:
                  "newMonthly" in event ? event.newMonthly : 0,
                label: event.label,
              });
            } else {
              onChange({
                kind: "raise",
                atMonth: event.atMonth,
                newMonthly:
                  "newMonthly" in event ? event.newMonthly : 0,
                label: event.label,
              });
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="raise">Raise / contribution change</SelectItem>
            <SelectItem value="expense_shock">Expense shock</SelectItem>
            <SelectItem value="lump_sum">Lump sum</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="xs"
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive shrink-0"
          aria-label="Remove event"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">At month</Label>
          <Input
            type="number"
            min={0}
            step={1}
            className="h-7 text-xs"
            value={Number.isFinite(event.atMonth) ? event.atMonth : ""}
            onChange={(e) =>
              onChange({
                ...event,
                atMonth: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </div>
        <div className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">
            {event.kind === "lump_sum"
              ? `Amount (${baseCurrency})`
              : `New monthly (${baseCurrency})`}
          </Label>
          <MoneyInput
            allowNegative
            className="h-7 text-xs"
            value={
              event.kind === "lump_sum"
                ? Number.isFinite(event.amount)
                  ? event.amount
                  : null
                : Number.isFinite(event.newMonthly)
                  ? event.newMonthly
                  : null
            }
            onValueChange={(n) =>
              event.kind === "lump_sum"
                ? onChange({ ...event, amount: n ?? 0 })
                : onChange({ ...event, newMonthly: n ?? 0 })
            }
          />
        </div>
      </div>
    </div>
  );
}
