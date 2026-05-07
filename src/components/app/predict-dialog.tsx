"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  Plus,
  Sparkles,
  Target,
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  suggestScenarios,
  type SuggestedScenario,
} from "@/lib/actions/projections";
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
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: PredictDialogGoal[];
  defaultGoalId: number | null;
  defaultHorizonMonths: number;
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
            <PreviewList
              scenarios={results!}
              picked={picked}
              onToggle={toggle}
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
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generate}
                  disabled={busy}
                >
                  <Sparkles className="size-4" />
                  Regenerate
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

function PreviewList({
  scenarios,
  picked,
  onToggle,
}: {
  scenarios: SuggestedScenario[];
  picked: Set<number>;
  onToggle: (i: number) => void;
}) {
  return (
    <div className="space-y-3">
      {scenarios.map((s, i) => {
        const checked = picked.has(i);
        const eventsCount = s.events.length;
        return (
          <button
            type="button"
            key={i}
            onClick={() => onToggle(i)}
            className={cn(
              "w-full text-left rounded-lg border bg-card transition-all p-3 space-y-2",
              checked
                ? "border-primary/60 ring-2 ring-primary/15"
                : "border-border hover:border-border/80",
            )}
            aria-pressed={checked}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(i)}
                onClick={(e) => e.stopPropagation()}
                className="mt-1 size-4 shrink-0"
                aria-label={`Include "${s.name}"`}
              />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{s.name}</span>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {formatMoney(s.monthlyContribution, "USD", { compact: true }).replace(/\$/g, "")}/mo
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {s.annualReturnPct}% APR
                  </Badge>
                  {eventsCount > 0 ? (
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {eventsCount} event{eventsCount === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[12px] text-muted-foreground leading-snug">
                  <span className="font-medium text-foreground">Why:</span>{" "}
                  {s.rationale}
                </p>
                <p className="text-[12px] text-muted-foreground leading-snug">
                  <span className="font-medium text-foreground">What happens:</span>{" "}
                  {s.summary}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
