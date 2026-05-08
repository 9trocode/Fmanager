"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  BookmarkCheck,
  History,
  Loader2,
  MessageSquarePlus,
  Save,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  applyProposedEdits,
  suggestScenarios,
  type DraftContext,
  type ProposedEdit,
  type SuggestedScenario,
} from "@/lib/actions/projections";
import { saveScenario as saveScenarioAction } from "@/lib/actions/saved-scenarios";
import {
  createPredictionSession,
  deletePredictionSession,
  maybeAutoTitlePredictionSession,
  upsertPredictionMessage,
  type PredictionSessionRow,
  type PredictionStoredMessage,
} from "@/lib/actions/predictions";
import {
  projectNetWorth,
  type ProjectionGrant,
  type ScenarioEvent,
} from "@/lib/projections";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ProjectionGoal = {
  id: number;
  name: string;
  kind: string;
  targetAmount: number | null;
  targetInBase: number | null;
  monthsToTarget: number | null;
};

export type BudgetEntity = {
  id: number;
  category: string;
  monthlyLimit: number;
  currency: string;
};

export type FlowEntity = {
  id: number;
  name: string;
  kind: "income" | "expense";
  amount: number;
  currency: string;
  cadence: "weekly" | "monthly" | "yearly";
};

type ChatMessage =
  | {
      id: string;
      role: "user";
      text: string;
      horizonMonths: number;
      goalName: string | null;
      createdAt: string;
    }
  | {
      id: string;
      role: "advisor";
      scenarios: ScenarioBlock[];
      createdAt: string;
    }
  | {
      id: string;
      role: "error";
      message: string;
      createdAt: string;
    };

type ScenarioBlock = {
  id: string;
  scenario: SuggestedScenario;
  saved: boolean;
  applied: boolean;
};

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Pure chat-first prediction surface. Replaces the old canvas + cards
 * + thread layout with a single scrollable conversation. Every AI
 * response renders inline as a stack of scenario panels — each panel
 * is a compact chart + name + rationale + summary + proposed edits +
 * save/apply buttons. No separate canvas, no separate rail.
 *
 * Design notes:
 *   - The horizon picker, goal selector, and prompt input live at the
 *     bottom in a single composer bar (always visible).
 *   - Scenarios are referenced through proposedEdits → real entities.
 *     The "Apply edits" button mutates the user's data via
 *     applyProposedEdits and locks the panel.
 *   - The "Save" button persists the scenario configuration to
 *     saved_scenarios so it can be reloaded in a future conversation
 *     (out of scope for this surface; saved is just write-only here
 *     for now).
 *   - Refinement context: each AI request includes the most recent
 *     advisor message's scenarios as DraftContext[] so the model can
 *     produce REPLACEMENTS by name when the user says "make the
 *     second more aggressive."
 */
export function ProjectionChat({
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  goals,
  budgetEntities: initialBudgetEntities,
  flowEntities: initialFlowEntities,
  initialSessionId,
  initialMessages,
  sessions,
}: {
  baseCurrency: string;
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  goals: ProjectionGoal[];
  budgetEntities: BudgetEntity[];
  flowEntities: FlowEntity[];
  initialSessionId: number | null;
  initialMessages: PredictionStoredMessage[];
  sessions: PredictionSessionRow[];
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<number | null>(initialSessionId);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  // Stop affordance. Server actions can't be cancelled mid-flight, but
  // we can drop their results client-side. The user gets immediate
  // visual feedback; any "phantom" advisor message that lands after
  // stop is ignored. Worst case: a wasted server compute, no
  // misleading state.
  const abortRef = useRef<{ generation: number }>({ generation: 0 });
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessages
      .map((m) => deserializeMessage(m))
      .filter((m): m is ChatMessage => m != null),
  );
  const [prompt, setPrompt] = useState("");
  const [horizonValue, setHorizonValue] = useState<number>(5);
  const [horizonUnit, setHorizonUnit] = useState<"months" | "years">("years");
  const [goalId, setGoalId] = useState<number | null>(null);
  // Plain busy state (not useTransition) so `stop()` can flip the UI
  // out of the spinner immediately, even though the server-side
  // computation continues until it naturally completes.
  const [busy, setBusy] = useState(false);
  const [budgetEntities, setBudgetEntities] = useState(initialBudgetEntities);
  const [flowEntities, setFlowEntities] = useState(initialFlowEntities);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-scroll only when the user is near the bottom (so reading
  // earlier messages mid-conversation isn't yanked away).
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  const horizonMonths = useMemo(
    () =>
      Math.max(
        1,
        Math.min(
          360,
          Math.round(horizonUnit === "years" ? horizonValue * 12 : horizonValue) ||
            60,
        ),
      ),
    [horizonValue, horizonUnit],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedToBottom) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pinnedToBottom, busy]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinnedToBottom(distanceFromBottom < 120);
  }

  function send() {
    const text = prompt.trim();
    if (!text || busy) return;

    const goal = goalId != null ? goals.find((g) => g.id === goalId) : null;
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      text,
      horizonMonths,
      goalName: goal?.name ?? null,
      createdAt: new Date().toISOString(),
    };

    const lastAdvisor = [...messages]
      .reverse()
      .find((m) => m.role === "advisor");
    const drafts: DraftContext[] =
      lastAdvisor && lastAdvisor.role === "advisor"
        ? lastAdvisor.scenarios.map((b) => ({
            name: b.scenario.name,
            monthlyContribution: b.scenario.monthlyContribution,
            annualReturnPct: b.scenario.annualReturnPct,
            horizonMonths: b.scenario.horizonMonths,
            rationale: b.scenario.rationale,
            summary: b.scenario.summary,
          }))
        : [];

    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setBusy(true);
    // Bump the generation counter so any earlier in-flight result
    // that lands after this point is recognized as stale.
    abortRef.current.generation += 1;
    const myGen = abortRef.current.generation;

    void (async () => {
      // Lazy-create a session on first send so empty threads don't
      // clutter the history dropdown.
      let activeId = sessionId;
      const isFirstUserTurn = messages.length === 0;
      if (activeId == null) {
        try {
          activeId = await createPredictionSession();
          setSessionId(activeId);
          window.history.replaceState({}, "", `/projections?s=${activeId}`);
        } catch (err) {
          // If session creation fails, the chat still works in-memory
          // — we just won't persist. Surface a soft warning.
          console.warn("[predict] failed to create session:", err);
        }
      }

      // Persist the user message immediately so a refresh during
      // generation finds it on the timeline.
      if (activeId != null) {
        try {
          await upsertPredictionMessage(activeId, {
            clientId: userMsg.id,
            role: "user",
            payload: userMsg,
          });
          if (isFirstUserTurn) {
            await maybeAutoTitlePredictionSession(activeId, text);
          }
        } catch (err) {
          console.warn("[predict] failed to persist user message:", err);
        }
      }

      const result = await suggestScenarios(text, goalId, horizonMonths, drafts);
      // If the user clicked Stop (or sent a follow-up that bumped the
      // counter), this result is stale — drop it without touching state.
      if (myGen !== abortRef.current.generation) return;
      if (!result.ok) {
        const errMsg: ChatMessage = {
          id: uid(),
          role: "error",
          message: result.error,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
        if (activeId != null) {
          try {
            await upsertPredictionMessage(activeId, {
              clientId: errMsg.id,
              role: "error",
              payload: errMsg,
            });
          } catch {}
        }
        return;
      }
      const blocks: ScenarioBlock[] = result.scenarios.map((s) => ({
        id: uid(),
        scenario: s,
        saved: false,
        applied: false,
      }));
      const advisorMsg: ChatMessage = {
        id: uid(),
        role: "advisor",
        scenarios: blocks,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, advisorMsg]);
      if (activeId != null) {
        try {
          await upsertPredictionMessage(activeId, {
            clientId: advisorMsg.id,
            role: "advisor",
            payload: advisorMsg,
          });
        } catch (err) {
          console.warn("[predict] failed to persist advisor message:", err);
        }
      }
      // Refresh the server-rendered sessions list (title may have just
      // been set) so the next render of the history dropdown is fresh.
      setTimeout(() => router.refresh(), 1500);
    })().finally(() => {
      // Only clear busy if THIS is still the active generation.
      // Otherwise a slow earlier call landing after a stop would
      // wipe the busy flag set by a follow-up.
      if (myGen === abortRef.current.generation) {
        setBusy(false);
      }
    });
  }

  function stop() {
    // Bump the generation so the in-flight result, when it lands, is
    // dropped. Doesn't actually cancel the model call on the server —
    // that compute is wasted — but the user gets immediate visual
    // feedback and can carry on.
    abortRef.current.generation += 1;
    setBusy(false);
    toast.info("Stopped. Any pending response will be discarded.");
  }

  function updateBlock(messageId: string, blockId: string, patch: Partial<ScenarioBlock>) {
    let updatedMsg: ChatMessage | null = null;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== "advisor" || m.id !== messageId) return m;
        const next: ChatMessage = {
          ...m,
          scenarios: m.scenarios.map((b) =>
            b.id === blockId ? { ...b, ...patch } : b,
          ),
        };
        updatedMsg = next;
        return next;
      }),
    );
    // Persist the new advisor-message payload so applied/saved
    // flags survive a refresh.
    if (sessionId != null && updatedMsg != null) {
      const snap = updatedMsg as ChatMessage;
      void upsertPredictionMessage(sessionId, {
        clientId: snap.id,
        role: "advisor",
        payload: snap,
      }).catch((err) => {
        console.warn("[predict] failed to persist block update:", err);
      });
    }
  }

  function applyEdits(messageId: string, block: ScenarioBlock) {
    if (block.scenario.proposedEdits.length === 0) return;
    void (async () => {
      const r = await applyProposedEdits(block.scenario.proposedEdits);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      // Mirror new values into local entity state so subsequent
      // refinements see post-edit baselines.
      setBudgetEntities((prev) =>
        prev.map((b) => {
          const e = block.scenario.proposedEdits.find(
            (x) => x.kind === "update_budget" && x.id === b.id,
          );
          return e && e.kind === "update_budget"
            ? { ...b, monthlyLimit: e.monthlyLimit }
            : b;
        }),
      );
      setFlowEntities((prev) =>
        prev.map((f) => {
          const e = block.scenario.proposedEdits.find(
            (x) => x.kind === "update_flow" && x.id === f.id,
          );
          return e && e.kind === "update_flow" ? { ...f, amount: e.amount } : f;
        }),
      );
      updateBlock(messageId, block.id, { applied: true });
      toast.success(
        r.skipped > 0
          ? `Applied ${r.applied} edit${r.applied === 1 ? "" : "s"} (${r.skipped} skipped).`
          : `Applied ${r.applied} edit${r.applied === 1 ? "" : "s"}.`,
      );
    })();
  }

  function persist(messageId: string, block: ScenarioBlock) {
    void (async () => {
      try {
        await saveScenarioAction({
          name: block.scenario.name,
          rationale: block.scenario.rationale,
          inputs: {
            monthlyContribution: block.scenario.monthlyContribution,
            annualReturnPct: block.scenario.annualReturnPct,
            horizonMonths: block.scenario.horizonMonths,
            events: block.scenario.events,
          },
          source: "ai",
          goalId,
        });
        updateBlock(messageId, block.id, { saved: true });
        toast.success(`Saved "${block.scenario.name}".`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed.");
      }
    })();
  }

  function startNewChat() {
    setSessionId(null);
    setMessages([]);
    setPrompt("");
    window.history.replaceState({}, "", `/projections`);
  }

  function switchSession(id: number) {
    if (id === sessionId) return;
    router.push(`/projections?s=${id}`);
  }

  function handleDelete(id: number) {
    void (async () => {
      try {
        await deletePredictionSession(id);
        toast.success("Conversation deleted");
        if (id === sessionId) {
          const next = sessions.find((s) => s.id !== id);
          if (next) {
            router.push(`/projections?s=${next.id}`);
          } else {
            setSessionId(null);
            setMessages([]);
            window.history.replaceState({}, "", `/projections`);
            router.refresh();
          }
        } else {
          router.refresh();
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't delete conversation.",
        );
      } finally {
        setConfirmDelete(null);
      }
    })();
  }

  const activeSessionRow = sessions.find((s) => s.id === sessionId);

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] min-h-[560px] rounded-xl border border-border bg-card/30 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-border bg-card/40 backdrop-blur-md">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <Sparkles className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">
            {activeSessionRow?.title ?? (sessionId ? "Loading…" : "New prediction")}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" className="text-muted-foreground">
                <History className="size-3.5" />
                History
                <span className="text-[10px] font-mono opacity-70 ml-1">
                  {sessions.length}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-[60vh] overflow-y-auto">
              <DropdownMenuLabel>Conversations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {sessions.length === 0 ? (
                <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                  No past conversations yet.
                </div>
              ) : (
                sessions.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={(e) => {
                      e.preventDefault();
                      switchSession(s.id);
                    }}
                    className="group flex items-start justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0 flex-1">
                      <div
                        className={
                          "text-sm truncate " +
                          (s.id === sessionId ? "font-medium" : "")
                        }
                      >
                        {s.title}
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {new Date(s.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setConfirmDelete(s.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity shrink-0 mt-0.5"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="xs"
            onClick={startNewChat}
            className="text-muted-foreground"
          >
            <MessageSquarePlus className="size-3.5" />
            New
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6"
      >
        {messages.length === 0 ? (
          <EmptyState onPick={(p) => setPrompt(p)} />
        ) : (
          messages.map((m) => (
            <MessageView
              key={m.id}
              msg={m}
              baseCurrency={baseCurrency}
              startNonGrantInBase={startNonGrantInBase}
              grants={grants}
              fxToBase={fxToBase}
              budgets={budgetEntities}
              flows={flowEntities}
              goals={goals}
              busy={busy}
              onApply={(block) => applyEdits(m.id, block)}
              onSave={(block) => persist(m.id, block)}
            />
          ))
        )}
        {busy && messages[messages.length - 1]?.role === "user" ? (
          <div className="flex gap-3 items-start">
            <AdvisorAvatar />
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="size-3.5 animate-spin" />
              Thinking through scenarios…
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-border px-4 sm:px-6 py-3 space-y-2"
      >
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends (chat-default). Shift+Enter inserts a
              // newline for multi-line prompts. IME composition (e.g.
              // Japanese, Korean) sets isComposing — don't intercept
              // that, the Enter is part of the composition.
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              messages.length === 0
                ? "What do you want to model? e.g. I'm getting a 30% raise in 4 months — can I hit my emergency fund target sooner?"
                : "Refine: make the second less aggressive · cut dining 20% as well · push the raise to month 12"
            }
            rows={2}
            disabled={busy}
            className="w-full rounded-md border border-input bg-background px-3 py-2 pr-12 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[64px]"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              aria-label="Stop"
              className="absolute bottom-2 right-2 inline-flex items-center justify-center size-8 rounded-md transition-colors bg-secondary text-foreground hover:bg-secondary/80 border border-border"
            >
              <X className="size-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!prompt.trim()}
              aria-label="Send"
              className={cn(
                "absolute bottom-2 right-2 inline-flex items-center justify-center size-8 rounded-md transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-secondary disabled:text-muted-foreground disabled:cursor-not-allowed",
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          )}
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
            onValueChange={(v) => setGoalId(v === "none" ? null : Number(v))}
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
            ↵ send · ⇧+↵ newline
          </span>
        </div>
      </form>

      <AlertDialog
        open={confirmDelete != null}
        onOpenChange={(v) => {
          if (!v) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              The thread and all of its scenarios are gone permanently.
              Anything you Saved or Applied stays in your books — those
              writes are independent of this thread.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete != null) handleDelete(confirmDelete);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * The stored payload IS a ChatMessage with the same shape we hold in
 * memory. Defensive: validate the role + return null on garbage so a
 * single bad row can't crash the whole hydration.
 */
function deserializeMessage(
  stored: PredictionStoredMessage,
): ChatMessage | null {
  if (!stored.payload || typeof stored.payload !== "object") return null;
  const p = stored.payload as Partial<ChatMessage> & { role?: string };
  if (p.role === "user" || p.role === "advisor" || p.role === "error") {
    // Use the stable client id from the row so subsequent updates
    // upsert against the same persisted message.
    return { ...(p as ChatMessage), id: stored.clientId };
  }
  return null;
}

function EmptyState({ onPick }: { onPick: (p: string) => void }) {
  const examples = [
    "What if I save 800k/mo at 5% for 3 years?",
    "I'm getting a 30% raise in 4 months — what does that do for my emergency fund?",
    "Show me what hitting FIRE in 10 years would actually require.",
    "Cut dining 30% — when do I hit my net-worth target?",
  ];
  return (
    <div className="max-w-xl mx-auto py-8 space-y-4 text-center">
      <div className="size-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center text-2xl font-semibold mx-auto">
        ƒ
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">Predict</h2>
        <p className="text-sm text-muted-foreground">
          Ask anything about your money — what-if calculations, paths to a
          goal, scenarios with raises or expense cuts. The advisor reads
          your real balance sheet and proposes concrete edits you can
          apply with one click.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onPick(ex)}
            className="text-left text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border/80 rounded-md px-3 py-2 transition-colors bg-secondary/30 hover:bg-secondary/60"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

function AdvisorAvatar() {
  return (
    <div className="size-7 shrink-0 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center text-[13px] font-semibold mt-0.5">
      ƒ
    </div>
  );
}

function MessageView({
  msg,
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  budgets,
  flows,
  goals,
  busy,
  onApply,
  onSave,
}: {
  msg: ChatMessage;
  baseCurrency: string;
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  budgets: BudgetEntity[];
  flows: FlowEntity[];
  goals: ProjectionGoal[];
  busy: boolean;
  onApply: (block: ScenarioBlock) => void;
  onSave: (block: ScenarioBlock) => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex gap-3 items-start">
        <div className="size-7 shrink-0 rounded-full bg-secondary grid place-items-center mt-0.5">
          <User className="size-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.text}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">
            {msg.horizonMonths}mo · {msg.goalName ?? "no target"}
          </div>
        </div>
      </div>
    );
  }
  if (msg.role === "error") {
    return (
      <div className="flex gap-3 items-start">
        <AdvisorAvatar />
        <div className="flex-1 text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
          {msg.message}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-3 items-start">
      <AdvisorAvatar />
      <div className="flex-1 min-w-0 space-y-3">
        <div className="text-xs font-medium text-muted-foreground">
          Advisor · {msg.scenarios.length} scenario
          {msg.scenarios.length === 1 ? "" : "s"}
        </div>
        <div className="space-y-3">
          {msg.scenarios.map((b) => (
            <ScenarioPanel
              key={b.id}
              block={b}
              baseCurrency={baseCurrency}
              startNonGrantInBase={startNonGrantInBase}
              grants={grants}
              fxToBase={fxToBase}
              budgets={budgets}
              flows={flows}
              goals={goals}
              busy={busy}
              onApply={() => onApply(b)}
              onSave={() => onSave(b)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScenarioPanel({
  block,
  baseCurrency,
  startNonGrantInBase,
  grants,
  fxToBase,
  budgets,
  flows,
  goals,
  busy,
  onApply,
  onSave,
}: {
  block: ScenarioBlock;
  baseCurrency: string;
  startNonGrantInBase: number;
  grants: ProjectionGrant[];
  fxToBase: Record<string, number>;
  budgets: BudgetEntity[];
  flows: FlowEntity[];
  goals: ProjectionGoal[];
  busy: boolean;
  onApply: () => void;
  onSave: () => void;
}) {
  const s = block.scenario;
  const points = useMemo(
    () =>
      projectNetWorth(startNonGrantInBase, grants, fxToBase, {
        monthlyContribution: s.monthlyContribution,
        annualReturnPct: s.annualReturnPct,
        horizonMonths: s.horizonMonths,
        events: s.events,
      }),
    [s, startNonGrantInBase, grants, fxToBase],
  );
  const endValue = points.length > 0 ? points[points.length - 1].floor : null;
  const eventsLine = summarizeEvents(s.events, baseCurrency);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{s.name}</span>
        </div>
        <div className="text-xs font-mono tabular-nums shrink-0">
          {endValue != null
            ? formatMoney(endValue, baseCurrency, { compact: true })
            : "—"}
          <span className="text-muted-foreground ml-1">
            in {(s.horizonMonths / 12).toFixed(1)}y
          </span>
        </div>
      </div>
      <div className="px-4 py-3 space-y-3">
        <Sparkline points={points} />

        <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
          <Badge variant="secondary">
            {formatMoney(s.monthlyContribution, baseCurrency, { compact: true })}/mo
          </Badge>
          <Badge variant="secondary">{s.annualReturnPct}% APR</Badge>
          {s.events.length > 0 ? (
            <Badge variant="outline">
              {s.events.length} event{s.events.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>

        {s.rationale ? (
          <p className="text-[12px] text-muted-foreground leading-snug">
            <span className="font-medium text-foreground">Why:</span>{" "}
            {s.rationale}
          </p>
        ) : null}
        {s.summary ? (
          <p className="text-[12px] text-muted-foreground leading-snug">
            <span className="font-medium text-foreground">What happens:</span>{" "}
            {s.summary}
          </p>
        ) : null}
        {eventsLine ? (
          <p className="text-[11px] text-muted-foreground/80 italic">
            {eventsLine}
          </p>
        ) : null}

        {s.proposedEdits.length > 0 ? (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-primary font-medium flex items-center gap-1">
              <Sparkles className="size-3" />
              Suggested edits ({s.proposedEdits.length})
            </div>
            <ul className="space-y-1">
              {s.proposedEdits.map((e, i) => (
                <li key={i} className="text-[12px] leading-snug">
                  <EditLine
                    edit={e}
                    budgets={budgets}
                    flows={flows}
                    goals={goals}
                    baseCurrency={baseCurrency}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-1.5 pt-1">
          {s.proposedEdits.length > 0 ? (
            <Button
              size="xs"
              variant={block.applied ? "ghost" : "default"}
              disabled={busy || block.applied}
              onClick={onApply}
            >
              {block.applied ? (
                <>
                  <BookmarkCheck className="size-3.5" />
                  Applied
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Apply edits
                </>
              )}
            </Button>
          ) : null}
          <Button
            size="xs"
            variant={block.saved ? "ghost" : "outline"}
            disabled={busy || block.saved}
            onClick={onSave}
          >
            {block.saved ? (
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
      </div>
    </div>
  );
}

function EditLine({
  edit,
  budgets,
  flows,
  goals,
  baseCurrency,
}: {
  edit: ProposedEdit;
  budgets: BudgetEntity[];
  flows: FlowEntity[];
  goals: ProjectionGoal[];
  baseCurrency: string;
}) {
  let label = "";
  let from = "";
  let to = "";
  if (edit.kind === "update_budget") {
    const b = budgets.find((x) => x.id === edit.id);
    label = b ? `${b.category} budget` : `Budget #${edit.id}`;
    from = b ? formatMoney(b.monthlyLimit, b.currency, { compact: true }) : "—";
    to = formatMoney(edit.monthlyLimit, b?.currency ?? baseCurrency, {
      compact: true,
    });
  } else if (edit.kind === "update_flow") {
    const f = flows.find((x) => x.id === edit.id);
    label = f ? `${f.kind === "income" ? "+" : "−"} ${f.name}` : `Flow #${edit.id}`;
    from = f ? formatMoney(f.amount, f.currency, { compact: true }) : "—";
    to = formatMoney(edit.amount, f?.currency ?? baseCurrency, { compact: true });
  } else {
    const g = goals.find((x) => x.id === edit.id);
    label = g ? `Goal: ${g.name}` : `Goal #${edit.id}`;
    const parts: string[] = [];
    if (edit.monthlyContribution != null) {
      parts.push(
        `monthly → ${formatMoney(edit.monthlyContribution, baseCurrency, { compact: true })}`,
      );
    }
    if (edit.targetAmount != null) {
      parts.push(
        `target → ${formatMoney(edit.targetAmount, baseCurrency, { compact: true })}`,
      );
    }
    if (edit.horizonMonths != null) {
      parts.push(`horizon → ${edit.horizonMonths}mo`);
    }
    from = "current";
    to = parts.join(", ");
  }
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-medium">{label}:</span>
        <span className="font-mono tabular-nums text-muted-foreground">{from}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-mono tabular-nums">{to}</span>
      </div>
      <div className="text-muted-foreground/80">{edit.reason}</div>
    </>
  );
}

function Sparkline({
  points,
}: {
  points: { month: number; floor: number }[];
}) {
  if (points.length < 2) {
    return <div className="text-[10px] text-muted-foreground">No data</div>;
  }
  const values = points.map((p) => p.floor);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 600;
  const height = 80;
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((p.floor - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  // Area under the line for visual weight.
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-20"
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={area} fill="var(--primary)" fillOpacity={0.08} />
      <path
        d={path}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function summarizeEvents(events: ScenarioEvent[], currency: string): string {
  if (events.length === 0) return "";
  return events
    .map((e) => {
      const at = `@ mo ${e.atMonth}`;
      if (e.kind === "raise") {
        return `Raise to ${formatMoney(e.newMonthly, currency, { compact: true })} ${at}`;
      }
      if (e.kind === "expense_shock") {
        return `Cut to ${formatMoney(e.newMonthly, currency, { compact: true })} ${at}`;
      }
      return `${e.amount >= 0 ? "+" : ""}${formatMoney(e.amount, currency, { compact: true })} lump ${at}`;
    })
    .join(" · ");
}
