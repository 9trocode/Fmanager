"use client";

import { useEffect, useState } from "react";
import { Sparkles, Footprints, AlertTriangle, BookOpen, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  getGoalNuggets,
  type GoalNugget,
} from "@/lib/actions/goal-nuggets";

const KIND_META: Record<GoalNugget["kind"], { label: string; Icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  unlock: {
    label: "Unlock",
    Icon: Sparkles,
    tone: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  },
  next_step: {
    label: "Next step",
    Icon: Footprints,
    tone: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  },
  watch: {
    label: "Watch",
    Icon: AlertTriangle,
    tone: "text-destructive bg-destructive/10 border-destructive/30",
  },
  did_you_know: {
    label: "Did you know",
    Icon: BookOpen,
    tone: "text-muted-foreground bg-secondary/40 border-border",
  },
};

/**
 * Lazy advisor commentary on a single goal. Fires one model call on
 * first render (and on user-triggered refresh), no persistence —
 * always reflects the latest goal/account state. Each nugget renders
 * as a tinted bordered row with a kind-specific icon: Unlock /
 * Next step / Watch / Did you know.
 */
export function GoalNuggets({ goalId }: { goalId: number }) {
  const [nuggets, setNuggets] = useState<GoalNugget[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError(null);
    let cancelled = false;
    getGoalNuggets(goalId)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setNuggets(r.nuggets);
        else setError(r.error);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    return load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Worth knowing
          </CardTitle>
          <CardDescription>
            Quick advisor commentary on this goal — what hitting it
            unlocks, what to do next, and what to watch.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => load()}
          disabled={loading}
          className="text-muted-foreground"
          aria-label="Refresh"
        >
          <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && nuggets == null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-12 rounded-md bg-secondary/30 animate-pulse"
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
            {error}
          </div>
        ) : nuggets && nuggets.length > 0 ? (
          <ul className="space-y-2">
            {nuggets.map((n, i) => {
              const meta = KIND_META[n.kind];
              const Icon = meta.Icon;
              return (
                <li
                  key={i}
                  className={`flex items-start gap-2.5 rounded-md border px-3 py-2 ${meta.tone}`}
                >
                  <Icon className="size-3.5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] uppercase tracking-wide opacity-70 font-medium">
                      {meta.label}
                    </div>
                    <div className="text-[13px] leading-snug text-foreground">
                      {n.text}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-xs text-muted-foreground">
            No nuggets returned. Try refresh.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
