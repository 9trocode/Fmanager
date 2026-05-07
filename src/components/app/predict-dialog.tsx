"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  BookmarkCheck,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { MoneyInput } from "@/components/app/money-input";
import { cn } from "@/lib/utils";
import {
  refineScenario,
  suggestScenarios,
  type SuggestedScenario,
} from "@/lib/actions/projections";
import { saveScenario as saveScenarioAction } from "@/lib/actions/saved-scenarios";
import {
  projectNetWorth,
  type ProjectionGrant,
} from "@/lib/projections";
import type { Scenario as EquityScenario } from "@/lib/scenarios";
import { formatMoney } from "@/lib/format";

export type PredictDialogGoal = {
  id: number;
  name: string;
};

/**
 * Predict dialog. Two modes inside one shell:
 *
 *  1. Form — pick horizon (months / years toggle + presets), goal, and
 *     a free-text "what should we model" prompt. Submit calls the AI.
 *  2. Preview — the returned scenarios are listed as cards with the
 *     rationale + summary + key inputs visible. The user picks which
 *     ones to add to the canvas (default: all selected). Apply pushes
 *     them into the explorer's scenario list and closes the dialog.
 *
 * Why a dialog instead of inline panel: prediction is a deliberate act
 * with several knobs (horizon especially), and the result is worth a
 * preview-before-commit step. Inline panels work for one-button
 * actions; this isn't one.
 */
export function PredictDialog({
  open,
  onOpenChange,
  goals,
  defaultGoalId,
  defaultHorizonMonths,
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  view,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: PredictDialogGoal[];
  defaultGoalId: number | null;
  defaultHorizonMonths: number;
  baseCurrency: string;
  /** Starting non-grant principal in base currency — for the mini-charts. */
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  /** Equity scenario to plot in the mini-chart (matches the canvas view). */
  view: EquityScenario;
  onApply: (scenarios: SuggestedScenario[]) => void;
}) {
  const [goalId, setGoalId] = useState<number | null>(defaultGoalId);
  const [horizonValue, setHorizonValue] = useState<number>(
    defaultHorizonMonths >= 24
      ? Math.round(defaultHorizonMonths / 12)
      : defaultHorizonMonths,
  );
  const [horizonUnit, setHorizonUnit] = useState<"months" | "years">(
    defaultHorizonMonths >= 24 ? "years" : "months",
  );
  const [prompt, setPrompt] = useState("");
  const [busy, startGen] = useTransition();
  const [results, setResults] = useState<SuggestedScenario[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  // Per-scenario flags so the workspace can show spinners only on the
  // card the user is actively iterating on.
  const [refiningIdx, setRefiningIdx] = useState<number | null>(null);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Map<number, number>>(new Map());

  const horizonMonths = useMemo(
    () =>
      Math.max(
        1,
        Math.min(360, Math.round(horizonUnit === "years" ? horizonValue * 12 : horizonValue) || 60),
      ),
    [horizonValue, horizonUnit],
  );
  const horizonYears = (horizonMonths / 12).toFixed(1);

  function reset() {
    setResults(null);
    setPicked(new Set());
    setPrompt("");
  }

  function handleClose(next: boolean) {
    onOpenChange(next);
    if (!next) {
      // Defer reset so the close animation doesn't flash the form back in.
      setTimeout(reset, 200);
    }
  }

  function applyPreset(months: number) {
    if (months >= 24) {
      setHorizonUnit("years");
      setHorizonValue(Math.round(months / 12));
    } else {
      setHorizonUnit("months");
      setHorizonValue(months);
    }
  }

  function generate() {
    startGen(async () => {
      const result = await suggestScenarios(prompt, goalId, horizonMonths);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.scenarios.length === 0) {
        toast.warning("The advisor didn't return any scenarios — try a more specific prompt.");
        return;
      }
      setResults(result.scenarios);
      // Default: every returned scenario is selected. User unchecks
      // anything they don't want.
      setPicked(new Set(result.scenarios.map((_, i) => i)));
    });
  }

  function applyPicked() {
    if (!results) return;
    const chosen = results.filter((_, i) => picked.has(i));
    if (chosen.length === 0) {
      toast.error("Pick at least one scenario to add.");
      return;
    }
    onApply(chosen);
    handleClose(false);
    toast.success(`Added ${chosen.length} scenario${chosen.length === 1 ? "" : "s"}.`);
  }

  function toggle(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  /**
   * Mutate one scenario in-place inside the preview workspace. Used by
   * the inline knob editors (monthlyContribution, annualReturnPct,
   * name) so the user can tweak before applying without losing the
   * original AI rationale + summary.
   */
  function updateScenario(i: number, patch: Partial<SuggestedScenario>) {
    setResults((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      next[i] = { ...next[i], ...patch };
      return next;
    });
    // Editing a saved scenario decouples it — the saved row is now stale.
    setSavedIds((prev) => {
      if (!prev.has(i)) return prev;
      const next = new Map(prev);
      next.delete(i);
      return next;
    });
  }

  /**
   * Replace one scenario with a refined version from the AI. The user
   * gives a short follow-up ("more aggressive", "swap lump sum for raise",
   * "what if expenses also drop 20%"). We send the existing scenario
   * plus the instruction; the result lands in the same slot.
   */
  function refineOne(i: number, refinePrompt: string) {
    if (!results) return;
    const current = results[i];
    setRefiningIdx(i);
    startGen(async () => {
      try {
        const result = await refineScenario(
          current,
          refinePrompt,
          goalId,
          horizonMonths,
        );
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setResults((prev) => {
          if (!prev) return prev;
          const next = prev.slice();
          next[i] = result.scenario;
          return next;
        });
        // Refining decouples a saved scenario.
        setSavedIds((prev) => {
          if (!prev.has(i)) return prev;
          const next = new Map(prev);
          next.delete(i);
          return next;
        });
        toast.success("Refined.");
      } finally {
        setRefiningIdx(null);
      }
    });
  }

  function persistScenario(i: number) {
    if (!results) return;
    const s = results[i];
    if (!s.name.trim()) {
      toast.error("Give the scenario a name before saving.");
      return;
    }
    setSavingIdx(i);
    startGen(async () => {
      try {
        const { id } = await saveScenarioAction({
          name: s.name,
          rationale: s.rationale,
          inputs: {
            monthlyContribution: s.monthlyContribution,
            annualReturnPct: s.annualReturnPct,
            horizonMonths: s.horizonMonths,
            events: s.events,
          },
          source: "ai",
          goalId,
        });
        setSavedIds((prev) => {
          const next = new Map(prev);
          next.set(i, id);
          return next;
        });
        toast.success(`Saved "${s.name}".`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      } finally {
        setSavingIdx(null);
      }
    });
  }

  function generateMore() {
    if (!results) return;
    startGen(async () => {
      const result = await suggestScenarios(
        prompt + "\n\nGenerate one ADDITIONAL scenario distinct from the ones already proposed.",
        goalId,
        horizonMonths,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Append the first new scenario; ignore extras to keep the
      // workspace from ballooning beyond what the user asked for.
      const fresh = result.scenarios[0];
      if (!fresh) {
        toast.warning("No new scenario was returned.");
        return;
      }
      setResults((prev) => {
        const next = prev ? [...prev, fresh] : [fresh];
        return next;
      });
      setPicked((prev) => {
        const next = new Set(prev);
        next.add((results?.length ?? 0));
        return next;
      });
      toast.success("Added one more.");
    });
  }

  function removeOne(i: number) {
    setResults((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
    setPicked((prev) => {
      const next = new Set<number>();
      // Re-key picked indices around the removal.
      for (const idx of prev) {
        if (idx === i) continue;
        next.add(idx > i ? idx - 1 : idx);
      }
      return next;
    });
    setSavedIds((prev) => {
      const next = new Map<number, number>();
      for (const [idx, id] of prev) {
        if (idx === i) continue;
        next.set(idx > i ? idx - 1 : idx, id);
      }
      return next;
    });
  }

  const showPreview = results != null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-4 text-primary" />
            Predict scenarios
          </DialogTitle>
          <DialogDescription>
            {showPreview
              ? `Pick which scenarios to add to your canvas. All projected over ${horizonYears} years.`
              : "Pick a horizon, optionally anchor on a goal, and describe what you want to model."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {showPreview ? (
            <PredictWorkspace
              scenarios={results!}
              picked={picked}
              savedIds={savedIds}
              refiningIdx={refiningIdx}
              savingIdx={savingIdx}
              busy={busy}
              baseCurrency={baseCurrency}
              startNonGrantInBase={startNonGrantInBase}
              grants={grants}
              fxToBase={fxToBase}
              view={view}
              onToggle={toggle}
              onUpdate={updateScenario}
              onRefine={refineOne}
              onSave={persistScenario}
              onRemove={removeOne}
            />
          ) : (
            <FormBody
              goals={goals}
              goalId={goalId}
              setGoalId={setGoalId}
              horizonValue={horizonValue}
              setHorizonValue={setHorizonValue}
              horizonUnit={horizonUnit}
              setHorizonUnit={setHorizonUnit}
              applyPreset={applyPreset}
              prompt={prompt}
              setPrompt={setPrompt}
              busy={busy}
              horizonMonths={horizonMonths}
            />
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          {showPreview ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResults(null)}
                disabled={busy}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={generateMore}
                  disabled={busy}
                >
                  <Plus className="size-4" />
                  One more
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generate}
                  disabled={busy}
                >
                  <Sparkles className="size-4" />
                  Regenerate all
                </Button>
                <Button
                  size="sm"
                  onClick={applyPicked}
                  disabled={busy || picked.size === 0}
                >
                  <Plus className="size-4" />
                  Add {picked.size > 0 ? `(${picked.size})` : ""}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={generate}
                disabled={busy}
                loading={busy}
                loadingText="Predicting…"
              >
                <Zap className="size-4" />
                Generate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormBody({
  goals,
  goalId,
  setGoalId,
  horizonValue,
  setHorizonValue,
  horizonUnit,
  setHorizonUnit,
  applyPreset,
  prompt,
  setPrompt,
  busy,
  horizonMonths,
}: {
  goals: PredictDialogGoal[];
  goalId: number | null;
  setGoalId: (v: number | null) => void;
  horizonValue: number;
  setHorizonValue: (v: number) => void;
  horizonUnit: "months" | "years";
  setHorizonUnit: (v: "months" | "years") => void;
  applyPreset: (months: number) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  busy: boolean;
  horizonMonths: number;
}) {
  const presets = [
    { label: "6mo", months: 6 },
    { label: "1y", months: 12 },
    { label: "3y", months: 36 },
    { label: "5y", months: 60 },
    { label: "10y", months: 120 },
    { label: "30y", months: 360 },
  ];
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label className="text-sm font-medium flex items-center gap-1.5">
          <Target className="size-3.5 text-muted-foreground" />
          Predict over
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            value={Number.isFinite(horizonValue) ? horizonValue : ""}
            onChange={(e) =>
              setHorizonValue(Math.max(1, Number(e.target.value) || 1))
            }
            className="w-24"
            disabled={busy}
          />
          <Select
            value={horizonUnit}
            onValueChange={(v) => setHorizonUnit(v as "months" | "years")}
            disabled={busy}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="months">Months</SelectItem>
              <SelectItem value="years">Years</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            ≈ {horizonMonths} months
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {presets.map((p) => {
            const active = horizonMonths === p.months;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.months)}
                disabled={busy}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Every generated scenario will run over exactly this window.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Anchor goal (optional)</Label>
        <Select
          value={goalId == null ? "none" : String(goalId)}
          onValueChange={(v) => setGoalId(v === "none" ? null : Number(v))}
          disabled={busy}
        >
          <SelectTrigger>
            <SelectValue placeholder="No specific goal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No specific goal</SelectItem>
            {goals.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          When set, the advisor models the gap to this goal under different
          levers and reports per-scenario ETA.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">What to model</Label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. I'm getting a 30% raise in 4 months, can I hit the emergency fund target sooner? Also try a version where I cut dining 50%."
          rows={4}
          disabled={busy}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[100px]"
        />
        <p className="text-[11px] text-muted-foreground">
          Specifics work best — name the lever (raise, expense cut, lump
          sum) and the timing.
        </p>
      </div>
    </div>
  );
}

function PredictWorkspace({
  scenarios,
  picked,
  savedIds,
  refiningIdx,
  savingIdx,
  busy,
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  view,
  onToggle,
  onUpdate,
  onRefine,
  onSave,
  onRemove,
}: {
  scenarios: SuggestedScenario[];
  picked: Set<number>;
  savedIds: Map<number, number>;
  refiningIdx: number | null;
  savingIdx: number | null;
  busy: boolean;
  baseCurrency: string;
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  view: EquityScenario;
  onToggle: (i: number) => void;
  onUpdate: (i: number, patch: Partial<SuggestedScenario>) => void;
  onRefine: (i: number, refinePrompt: string) => void;
  onSave: (i: number) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="space-y-3">
      {scenarios.map((s, i) => (
        <WorkspaceCard
          key={i}
          scenario={s}
          checked={picked.has(i)}
          isSaved={savedIds.has(i)}
          isRefining={refiningIdx === i}
          isSaving={savingIdx === i}
          busy={busy}
          baseCurrency={baseCurrency}
          startNonGrantInBase={startNonGrantInBase}
          grants={grants}
          fxToBase={fxToBase}
          view={view}
          onToggle={() => onToggle(i)}
          onUpdate={(patch) => onUpdate(i, patch)}
          onRefine={(p) => onRefine(i, p)}
          onSave={() => onSave(i)}
          onRemove={() => onRemove(i)}
        />
      ))}
      {scenarios.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center text-sm text-muted-foreground">
          All scenarios removed. Use &quot;One more&quot; below to generate
          another, or &quot;Back&quot; to start over.
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceCard({
  scenario,
  checked,
  isSaved,
  isRefining,
  isSaving,
  busy,
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  view,
  onToggle,
  onUpdate,
  onRefine,
  onSave,
  onRemove,
}: {
  scenario: SuggestedScenario;
  checked: boolean;
  isSaved: boolean;
  isRefining: boolean;
  isSaving: boolean;
  busy: boolean;
  baseCurrency: string;
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  view: EquityScenario;
  onToggle: () => void;
  onUpdate: (patch: Partial<SuggestedScenario>) => void;
  onRefine: (prompt: string) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const [refineOpen, setRefineOpen] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState("");

  // Run the projection live as the user edits the knobs. Cheap (a
  // few hundred iterations); recharts handles the rest.
  const points = useMemo(
    () =>
      projectNetWorth(startNonGrantInBase, grants, fxToBase, {
        monthlyContribution: scenario.monthlyContribution,
        annualReturnPct: scenario.annualReturnPct,
        horizonMonths: scenario.horizonMonths,
        events: scenario.events,
      }),
    [scenario, startNonGrantInBase, grants, fxToBase],
  );
  const endValue = points.length > 0 ? points[points.length - 1][view] : null;

  function submitRefine() {
    onRefine(refinePrompt);
    setRefineOpen(false);
    setRefinePrompt("");
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-all overflow-hidden",
        checked
          ? "border-primary/60 ring-2 ring-primary/15"
          : "border-border",
        (isRefining || isSaving) && "opacity-90",
      )}
    >
      {/* Header — checkbox + editable name + status icons */}
      <div className="flex items-start gap-2 p-3 pb-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1.5 size-4 shrink-0"
          aria-label={`Include "${scenario.name}"`}
        />
        <input
          value={scenario.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded px-1 -mx-1"
          aria-label="Scenario name"
        />
        {isRefining ? (
          <Loader2 className="size-3.5 shrink-0 mt-1.5 animate-spin text-primary" />
        ) : isSaved ? (
          <BookmarkCheck className="size-3.5 shrink-0 mt-1.5 text-emerald-600 dark:text-emerald-500" />
        ) : (
          <Sparkles className="size-3.5 shrink-0 mt-1.5 text-primary" />
        )}
      </div>

      <div className="px-3 pb-3 space-y-2.5">
        {/* Rationale + summary */}
        {scenario.rationale ? (
          <p className="text-[12px] text-muted-foreground leading-snug pl-7">
            <span className="font-medium text-foreground">Why:</span>{" "}
            {scenario.rationale}
          </p>
        ) : null}
        {scenario.summary ? (
          <p className="text-[12px] text-muted-foreground leading-snug pl-7">
            <span className="font-medium text-foreground">What happens:</span>{" "}
            {scenario.summary}
          </p>
        ) : null}

        {/* Editable knobs + mini chart side-by-side */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_140px] gap-3 pl-7 pt-1">
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Monthly contribution ({baseCurrency})
              </Label>
              <MoneyInput
                allowNegative
                className="h-8 text-xs"
                value={scenario.monthlyContribution}
                onValueChange={(n) => onUpdate({ monthlyContribution: n ?? 0 })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Return %/yr
                </Label>
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 text-xs"
                  value={
                    Number.isFinite(scenario.annualReturnPct)
                      ? scenario.annualReturnPct
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
                <Label className="text-[10px] text-muted-foreground">
                  Events
                </Label>
                <div className="h-8 px-2 text-xs flex items-center text-muted-foreground border border-border rounded-md bg-secondary/30">
                  {scenario.events.length}{" "}
                  {scenario.events.length === 1 ? "event" : "events"}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              In {(scenario.horizonMonths / 12).toFixed(1)}y
            </Label>
            <div className="rounded-md border border-border bg-secondary/30 p-2 h-[68px] flex flex-col justify-between">
              <Sparkline
                points={points}
                view={view}
                colorVar="var(--primary)"
              />
              <div className="text-[11px] font-mono tabular-nums text-foreground">
                {endValue != null
                  ? formatMoney(endValue, baseCurrency, { compact: true })
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* Inline refine prompt */}
        {refineOpen ? (
          <div className="rounded-md border border-primary/40 bg-secondary/30 p-2 space-y-2 ml-7">
            <Label className="text-[10px] text-muted-foreground">
              Refine this scenario
            </Label>
            <textarea
              value={refinePrompt}
              onChange={(e) => setRefinePrompt(e.target.value)}
              placeholder="e.g. swap the lump sum for a recurring raise · cut expenses 20% as well · push the raise to month 12"
              rows={2}
              disabled={busy}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-[12px] shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[48px]"
            />
            <div className="flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setRefineOpen(false);
                  setRefinePrompt("");
                }}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={submitRefine}
                disabled={busy || !refinePrompt.trim()}
              >
                <Sparkles className="size-3.5" />
                Refine
              </Button>
            </div>
          </div>
        ) : null}

        {/* Action row */}
        <div className="flex items-center justify-between gap-1.5 pl-7">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setRefineOpen((o) => !o)}
              disabled={busy || refineOpen}
            >
              <RefreshCw className="size-3.5" />
              Refine
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={onSave}
              disabled={busy || isSaved}
            >
              {isSaved ? (
                <>
                  <BookmarkCheck className="size-3.5" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Save
                </>
              )}
            </Button>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onRemove}
            disabled={busy}
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${scenario.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny SVG sparkline — recharts is overkill for a 60×40 mini-chart
 * inside a card. Plots `view` over the projection horizon, normalized
 * to fit the box.
 */
function Sparkline({
  points,
  view,
  colorVar,
}: {
  points: { month: number; floor: number; liquid: number; expected: number }[];
  view: EquityScenario;
  colorVar: string;
}) {
  if (points.length < 2) {
    return (
      <div className="text-[10px] text-muted-foreground">No data</div>
    );
  }
  const values = points.map((p) => p[view]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 120;
  const height = 32;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p[view] - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-8"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={path}
        fill="none"
        stroke={colorVar}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
