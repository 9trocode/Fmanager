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
  BookmarkCheck,
  ChevronDown,
  ChevronRight,
  Folder,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TrendingUp,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { type SuggestedScenario } from "@/lib/actions/projections";
import {
  deleteSavedScenario,
  saveScenario as saveScenarioAction,
  updateSavedScenario,
  type SavedScenarioRow,
} from "@/lib/actions/saved-scenarios";
import { PredictDialog } from "@/components/app/predict-dialog";
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

/**
 * Local extension of `NamedScenario` with extra display + persistence
 * metadata. Lives on the client only — the engine works with plain
 * `NamedScenario`, so we strip these fields before projecting.
 */
type ExplorerScenario = NamedScenario & {
  rationale?: string | null;
  summary?: string | null;
  source?: "user" | "ai";
  savedId?: number | null;
  /** True when the user has edited a saved scenario since the last persist. */
  dirty?: boolean;
};

function makeBaseScenario(
  name: string,
  defaults: { monthly: number; returnPct?: number; horizon?: number },
): ExplorerScenario {
  return {
    id: uid(),
    name,
    inputs: {
      monthlyContribution: defaults.monthly,
      annualReturnPct: defaults.returnPct ?? 7,
      horizonMonths: defaults.horizon ?? 60,
      events: [],
    },
    source: "user",
  };
}

/**
 * One-line digest of a scenario's events, for the summary footer.
 * "Raise to 800k @ mo 6 · +500k lump @ mo 12 · cut to 200k @ mo 18"
 */
function summarizeEvents(events: ScenarioEvent[], currency: string): string {
  if (events.length === 0) return "";
  const parts = events.map((e) => {
    const at = `@ mo ${e.atMonth}`;
    if (e.kind === "raise") {
      return `Raise to ${formatMoney(e.newMonthly, currency, { compact: true })} ${at}`;
    }
    if (e.kind === "expense_shock") {
      return `Cut to ${formatMoney(e.newMonthly, currency, { compact: true })} ${at}`;
    }
    return `${e.amount >= 0 ? "+" : ""}${formatMoney(e.amount, currency, { compact: true })} lump ${at}`;
  });
  return parts.join(" · ");
}

export function ProjectionsExplorer({
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  defaultMonthlyContribution,
  goals,
  savedScenarios: initialSavedScenarios,
}: {
  baseCurrency: string;
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  defaultMonthlyContribution?: number;
  goals: ProjectionGoal[];
  savedScenarios: SavedScenarioRow[];
}) {
  const safeDefault = Number.isFinite(defaultMonthlyContribution)
    ? (defaultMonthlyContribution as number)
    : 3000;

  // Always-on baseline scenario + room for what-if siblings. The user
  // can rename the baseline; they can't remove the last scenario.
  const [scenarios, setScenarios] = useState<ExplorerScenario[]>(() => [
    makeBaseScenario("Current pace", { monthly: safeDefault }),
  ]);
  const [view, setView] = useState<EquityScenario>("floor");
  const [goalId, setGoalId] = useState<number | null>(null);
  const [predictOpen, setPredictOpen] = useState(false);
  // Mutable client-side mirror of the server's saved-scenarios list.
  // Updated on save / delete so the dropdown stays in sync without a
  // full page reload.
  const [savedLib, setSavedLib] = useState<SavedScenarioRow[]>(initialSavedScenarios);
  const [savePending, startSave] = useTransition();

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
          // Copies are unsaved by definition — drop savedId; keep
          // rationale/summary for context but mark as dirty.
          source: src.source,
          rationale: src.rationale,
          summary: src.summary,
          savedId: null,
          dirty: false,
        },
      ];
    });
  }

  function removeScenario(id: string) {
    setScenarios((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }

  function updateScenario(
    id: string,
    patch: Partial<NamedScenario["inputs"]> & { name?: string },
  ) {
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
              // Once a saved scenario is edited, surface that the
              // persisted copy is now stale. The Save button flips to
              // "Save changes" — same row, just an UPDATE.
              dirty: s.savedId != null ? true : s.dirty,
            }
          : s,
      ),
    );
  }

  function applySuggestions(suggestions: SuggestedScenario[]) {
    // Append so existing scenarios stay anchored at the top of the
    // user's viewport. AI rationale + summary travel with each card.
    const made: ExplorerScenario[] = suggestions.map((s) => ({
      id: uid(),
      name: s.name,
      inputs: {
        monthlyContribution: s.monthlyContribution,
        annualReturnPct: s.annualReturnPct,
        horizonMonths: s.horizonMonths,
        events: s.events,
      },
      rationale: s.rationale,
      summary: s.summary,
      source: "ai",
    }));
    setScenarios((prev) => [...prev, ...made]);
  }

  function loadSavedScenario(saved: SavedScenarioRow) {
    // Already on the canvas? Don't add a duplicate; bump the user back
    // to it instead. (Cheap toast — easier than a scroll-to.)
    if (scenarios.some((s) => s.savedId === saved.id)) {
      toast.info(`"${saved.name}" is already loaded.`);
      return;
    }
    setScenarios((prev) => [
      ...prev,
      {
        id: uid(),
        name: saved.name,
        inputs: saved.inputs,
        rationale: saved.rationale,
        summary: null,
        source: saved.source,
        savedId: saved.id,
        dirty: false,
      },
    ]);
  }

  function persistScenario(scenarioId: string) {
    const s = scenarios.find((x) => x.id === scenarioId);
    if (!s) return;
    if (!s.name.trim()) {
      toast.error("Give the scenario a name before saving.");
      return;
    }
    startSave(async () => {
      try {
        if (s.savedId == null) {
          const { id } = await saveScenarioAction({
            name: s.name,
            rationale: s.rationale ?? null,
            inputs: s.inputs,
            source: s.source ?? "user",
            goalId: goalId,
          });
          setScenarios((prev) =>
            prev.map((x) =>
              x.id === scenarioId
                ? { ...x, savedId: id, dirty: false }
                : x,
            ),
          );
          // Optimistic insert into the dropdown library so it shows up
          // without a refresh round-trip.
          const nowIso = new Date().toISOString();
          setSavedLib((prev) => [
            {
              id,
              name: s.name,
              rationale: s.rationale ?? null,
              source: s.source ?? "user",
              goalId,
              inputs: s.inputs,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            ...prev,
          ]);
          toast.success(`Saved "${s.name}".`);
        } else {
          await updateSavedScenario({
            id: s.savedId,
            name: s.name,
            rationale: s.rationale ?? null,
            inputs: s.inputs,
            goalId: goalId,
          });
          setScenarios((prev) =>
            prev.map((x) =>
              x.id === scenarioId ? { ...x, dirty: false } : x,
            ),
          );
          setSavedLib((prev) =>
            prev.map((row) =>
              row.id === s.savedId
                ? {
                    ...row,
                    name: s.name,
                    rationale: s.rationale ?? null,
                    inputs: s.inputs,
                    updatedAt: new Date().toISOString(),
                  }
                : row,
            ),
          );
          toast.success(`Updated "${s.name}".`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    });
  }

  function deleteSaved(id: number) {
    startSave(async () => {
      try {
        await deleteSavedScenario(id);
        setSavedLib((prev) => prev.filter((s) => s.id !== id));
        // Detach the savedId from any currently-loaded copy so the
        // user can still tweak/save it as a fresh row.
        setScenarios((prev) =>
          prev.map((s) =>
            s.savedId === id ? { ...s, savedId: null, dirty: false } : s,
          ),
        );
        toast.success("Deleted.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed.");
      }
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Folder className="size-4" />
                Saved
                {savedLib.length > 0 ? (
                  <span className="text-[10px] font-mono opacity-70 ml-1">
                    {savedLib.length}
                  </span>
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-80 max-h-[60vh] overflow-y-auto"
            >
              <DropdownMenuLabel>Saved scenarios</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {savedLib.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  Nothing saved yet. Use the Save icon on a scenario card.
                </div>
              ) : (
                savedLib.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      loadSavedScenario(s);
                    }}
                    className="group flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate flex items-center gap-1.5">
                        {s.name}
                        {s.source === "ai" ? (
                          <Sparkles className="size-3 text-primary shrink-0" />
                        ) : null}
                      </div>
                      {s.rationale ? (
                        <div className="text-[11px] text-muted-foreground line-clamp-2">
                          {s.rationale}
                        </div>
                      ) : null}
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {new Date(s.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        deleteSaved(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
                      aria-label="Delete saved scenario"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={addScenario}>
            <Plus className="size-4" /> Scenario
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => setPredictOpen(true)}
          >
            <Sparkles className="size-4" /> Predict
          </Button>
        </div>
      </div>

      <PredictDialog
        open={predictOpen}
        onOpenChange={setPredictOpen}
        goals={goals}
        defaultGoalId={goalId}
        defaultHorizonMonths={
          // Default to the longest current horizon on the canvas so a
          // user who set up a 10y baseline doesn't get a dialog
          // pre-filled with 5y by accident. min: 6mo.
          Math.max(
            6,
            ...scenarios.map((s) => s.inputs.horizonMonths || 60),
          )
        }
        onApply={applySuggestions}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          {scenarios.map((s, i) => {
            const series = byScenario[s.id];
            const endValue = series && series.length > 0
              ? series[series.length - 1][view]
              : null;
            // Delta vs the first scenario in the list (the de facto
            // baseline). The first scenario shows no delta.
            const baselineSeries = byScenario[scenarios[0].id];
            const baselineEnd = baselineSeries && baselineSeries.length > 0
              ? baselineSeries[Math.min(series?.length ? series.length - 1 : 0, baselineSeries.length - 1)][view]
              : null;
            const deltaVsBaseline =
              i === 0 || endValue == null || baselineEnd == null
                ? null
                : endValue - baselineEnd;
            return (
              <ScenarioCard
                key={s.id}
                scenario={s}
                colorVar={`var(--${PALETTE[i % PALETTE.length]})`}
                baseCurrency={baseCurrency}
                viewLabel={VIEW_LABEL[view]}
                etaMonths={etaByScenario[s.id] ?? null}
                endValue={endValue}
                deltaVsBaseline={deltaVsBaseline}
                canDelete={scenarios.length > 1}
                savePending={savePending}
                onUpdate={(patch) => updateScenario(s.id, patch)}
                onDuplicate={() => duplicateScenario(s.id)}
                onDelete={() => removeScenario(s.id)}
                onSave={() => persistScenario(s.id)}
              />
            );
          })}
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
  viewLabel,
  etaMonths,
  endValue,
  deltaVsBaseline,
  canDelete,
  savePending,
  onUpdate,
  onDuplicate,
  onDelete,
  onSave,
}: {
  scenario: ExplorerScenario;
  colorVar: string;
  baseCurrency: string;
  viewLabel: string;
  etaMonths: number | null;
  endValue: number | null;
  deltaVsBaseline: number | null;
  canDelete: boolean;
  savePending: boolean;
  onUpdate: (patch: Partial<NamedScenario["inputs"]> & { name?: string }) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(true);
  const events = scenario.inputs.events ?? [];
  const eventsSummary = summarizeEvents(events, baseCurrency);
  const isSaved = scenario.savedId != null;
  const isDirty = Boolean(scenario.dirty);
  const horizonYears = scenario.inputs.horizonMonths / 12;

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
        {scenario.source === "ai" ? (
          <Sparkles className="size-3.5 text-primary shrink-0" />
        ) : null}
        {isSaved && !isDirty ? (
          <BookmarkCheck className="size-3.5 text-emerald-600 dark:text-emerald-500 shrink-0" />
        ) : null}
        {etaMonths != null ? (
          <Badge variant="secondary" className="text-[10px] shrink-0 font-mono">
            ETA {etaMonths}mo
          </Badge>
        ) : null}
      </button>
      {open ? (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50">
          {/*
            Summary block. Shows the AI's rationale + summary up top
            (when present), the computed end-of-horizon value, and the
            delta against the first scenario. This is the "what does
            this prediction actually mean" surface — the most important
            thing on the card after the chart line.
          */}
          {(scenario.rationale || scenario.summary || endValue != null) ? (
            <div className="pt-3 space-y-2">
              {scenario.rationale ? (
                <p className="text-[12px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">Why:</span>{" "}
                  {scenario.rationale}
                </p>
              ) : null}
              {scenario.summary ? (
                <p className="text-[12px] leading-snug text-muted-foreground">
                  <span className="font-medium text-foreground">What happens:</span>{" "}
                  {scenario.summary}
                </p>
              ) : null}
              {endValue != null ? (
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-secondary/40 px-2.5 py-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      In {horizonYears.toFixed(1)}y · {viewLabel.split(" ")[0]}
                    </div>
                    <div className="font-mono tabular-nums text-base font-medium">
                      {formatMoney(endValue, baseCurrency, { compact: true })}
                    </div>
                  </div>
                  {deltaVsBaseline != null ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        vs baseline
                      </div>
                      <div
                        className={
                          "font-mono tabular-nums text-sm " +
                          (deltaVsBaseline > 0
                            ? "text-emerald-600 dark:text-emerald-500"
                            : deltaVsBaseline < 0
                              ? "text-destructive"
                              : "text-muted-foreground")
                        }
                      >
                        {deltaVsBaseline > 0 ? "+" : ""}
                        {formatMoney(deltaVsBaseline, baseCurrency, { compact: true })}
                      </div>
                    </div>
                  ) : null}
                  {etaMonths != null ? (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Goal ETA
                      </div>
                      <div className="font-mono tabular-nums text-sm">
                        {etaMonths === 0 ? "now" : `${etaMonths}mo`}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {eventsSummary ? (
                <p className="text-[11px] text-muted-foreground italic">
                  {eventsSummary}
                </p>
              ) : null}
            </div>
          ) : null}
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

          <div className="flex items-center justify-between gap-1 pt-1">
            <Button
              variant={isDirty ? "default" : isSaved ? "ghost" : "outline"}
              size="xs"
              onClick={onSave}
              disabled={savePending || (isSaved && !isDirty)}
            >
              {isSaved && !isDirty ? (
                <>
                  <BookmarkCheck className="size-3.5" />
                  Saved
                </>
              ) : isSaved ? (
                <>
                  <Save className="size-3.5" />
                  Save changes
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Save
                </>
              )}
            </Button>
            <div className="flex items-center gap-1">
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
                  Remove
                </Button>
              ) : null}
            </div>
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
