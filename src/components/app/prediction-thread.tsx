"use client";

import { useState } from "react";
import {
  ArrowUp,
  Sparkles,
  Trash2,
  Loader2,
  User,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ThreadMessage =
  | {
      id: string;
      kind: "user";
      text: string;
      horizonMonths: number;
      goalName: string | null;
      createdAt: string;
    }
  | {
      id: string;
      kind: "advisor";
      /** ids of scenarios the model produced for this turn — clickable chips. */
      scenarios: { id: string; name: string }[];
      summary: string;
      createdAt: string;
    }
  | {
      id: string;
      kind: "error";
      message: string;
      createdAt: string;
    };

export type PredictionThreadGoal = {
  id: number;
  name: string;
};

/**
 * Bottom-anchored chat surface for prediction. Replaces the modal
 * dialog. The user types ("what if I hit emergency fund in 18 months?"),
 * model returns scenarios that land on the chart as DRAFT (dashed)
 * lines, and the conversation is preserved so subsequent messages
 * can refine ("make the second less aggressive on expenses").
 */
export function PredictionThread({
  thread,
  busy,
  goals,
  goalId,
  onGoalChange,
  defaultHorizonMonths,
  draftCount,
  onSend,
  onDiscardAllDrafts,
  onScenarioClick,
}: {
  thread: ThreadMessage[];
  busy: boolean;
  goals: PredictionThreadGoal[];
  goalId: number | null;
  onGoalChange: (id: number | null) => void;
  defaultHorizonMonths: number;
  draftCount: number;
  onSend: (prompt: string, horizonMonths: number) => void;
  onDiscardAllDrafts: () => void;
  onScenarioClick: (scenarioId: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const initialUnit: "months" | "years" =
    defaultHorizonMonths >= 24 ? "years" : "months";
  const initialValue =
    initialUnit === "years"
      ? Math.round(defaultHorizonMonths / 12)
      : defaultHorizonMonths;
  const [horizonValue, setHorizonValue] = useState<number>(initialValue);
  const [horizonUnit, setHorizonUnit] = useState<"months" | "years">(
    initialUnit,
  );

  const horizonMonths = Math.max(
    1,
    Math.min(
      360,
      Math.round(horizonUnit === "years" ? horizonValue * 12 : horizonValue) ||
        60,
    ),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || busy) return;
    onSend(prompt.trim(), horizonMonths);
    setPrompt("");
  }

  return (
    <div className="rounded-xl border border-border bg-card/40 backdrop-blur-md overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="size-4 text-primary" />
          <span className="font-medium">Predict</span>
          <span className="text-xs text-muted-foreground">
            Ask, refine, save what works.
          </span>
        </div>
        {draftCount > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={onDiscardAllDrafts}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Discard {draftCount} draft{draftCount === 1 ? "" : "s"}
          </Button>
        ) : null}
      </div>

      {thread.length > 0 ? (
        <div className="max-h-[280px] overflow-y-auto px-4 py-3 space-y-3">
          {thread.map((m) => (
            <ThreadEntry
              key={m.id}
              msg={m}
              onScenarioClick={onScenarioClick}
            />
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Thinking…
            </div>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="px-4 py-3 space-y-2.5 border-t border-border"
      >
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              // Cmd/Ctrl+Enter submits — plain Enter inserts a newline,
              // matching most chat UIs. Tradeoff: one extra modifier
              // for power users vs. accidental submits on multi-line
              // prompts.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent);
              }
            }}
            placeholder={
              thread.length === 0
                ? "What do you want to model? e.g. I'm getting a 30% raise in 4 months — can I hit my emergency fund target sooner?"
                : "Refine: make the second less aggressive · swap the lump sum for a raise · push it to month 12"
            }
            rows={2}
            disabled={busy}
            className="w-full rounded-md border border-input bg-background px-3 py-2 pr-12 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[64px]"
          />
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            aria-label="Send"
            className={cn(
              "absolute bottom-2 right-2 inline-flex items-center justify-center size-8 rounded-md transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-secondary disabled:text-muted-foreground disabled:cursor-not-allowed",
            )}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Label className="text-[11px] text-muted-foreground/80">Over</Label>
          <Input
            type="number"
            min={1}
            value={Number.isFinite(horizonValue) ? horizonValue : ""}
            onChange={(e) =>
              setHorizonValue(Math.max(1, Number(e.target.value) || 1))
            }
            disabled={busy}
            className="h-7 w-16 text-xs"
          />
          <Select
            value={horizonUnit}
            onValueChange={(v) => setHorizonUnit(v as "months" | "years")}
            disabled={busy}
          >
            <SelectTrigger className="h-7 w-[88px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="months">months</SelectItem>
              <SelectItem value="years">years</SelectItem>
            </SelectContent>
          </Select>
          <span className="opacity-60 text-[10px] font-mono">
            ≈ {horizonMonths}mo
          </span>

          <span className="opacity-40">·</span>

          <Label className="text-[11px] text-muted-foreground/80">Goal</Label>
          <Select
            value={goalId == null ? "none" : String(goalId)}
            onValueChange={(v) => onGoalChange(v === "none" ? null : Number(v))}
            disabled={busy}
          >
            <SelectTrigger className="h-7 w-[160px] text-xs">
              <SelectValue placeholder="No target" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No target</SelectItem>
              {goals.map((g) => (
                <SelectItem key={g.id} value={String(g.id)}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="ml-auto opacity-40 text-[10px] font-mono">
            ⌘ + ↵ to send
          </span>
        </div>
      </form>
    </div>
  );
}

function ThreadEntry({
  msg,
  onScenarioClick,
}: {
  msg: ThreadMessage;
  onScenarioClick: (scenarioId: string) => void;
}) {
  if (msg.kind === "user") {
    return (
      <div className="flex gap-2 items-start">
        <div className="size-6 shrink-0 rounded-full bg-secondary grid place-items-center mt-0.5">
          <User className="size-3 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] leading-snug whitespace-pre-wrap break-words">
            {msg.text}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
            {msg.horizonMonths}mo · {msg.goalName ?? "no target"}
          </div>
        </div>
      </div>
    );
  }
  if (msg.kind === "error") {
    return (
      <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2.5 py-1.5">
        {msg.message}
      </div>
    );
  }
  return (
    <div className="flex gap-2 items-start">
      <div className="size-6 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center text-[11px] font-semibold mt-0.5">
        ƒ
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="text-[13px] leading-snug text-muted-foreground">
          {msg.summary}
        </div>
        {msg.scenarios.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {msg.scenarios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onScenarioClick(s.id)}
                className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 hover:bg-primary/20 transition-colors px-2 py-0.5 text-[11px] font-medium text-primary"
              >
                <Sparkles className="size-3" />
                {s.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
