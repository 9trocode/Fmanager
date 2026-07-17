"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import type { UIMessage } from "ai";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { AdvisorChat } from "@/app/(app)/advisor/advisor-chat";
import {
  getChatSession,
  listChatSessions,
  type ChatSessionRow,
} from "@/lib/actions/chat";

/**
 * Always-on advisor entry point — a circular button anchored bottom-right
 * on every (app) page. Click opens a right-side Sheet that hosts the same
 * AdvisorChat component used at /advisor.
 *
 * Why a Sheet rather than navigating to /advisor:
 *   The user wanted the advisor "usable on more pages" — i.e. they
 *   shouldn't have to leave the budgets / dashboard / accounts page they
 *   were on to ask the advisor about it. Right-side sheets keep their
 *   place in the app and let them flip back instantly.
 *
 * Why lazy-load the bootstrap (sessions + last messages):
 *   Most page views never open the advisor. Loading every chat session
 *   into the page payload would bloat the initial render. The button is
 *   cheap; the chat data only fetches on first open.
 *
 * Hidden on /advisor itself — there's already a full-page chat there,
 * having a floating button alongside is just visual noise.
 */
export function FloatingAdvisor() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [bootstrap, setBootstrap] = useState<{
    activeSessionId: number | null;
    initialMessages: UIMessage[];
    sessions: ChatSessionRow[];
  } | null>(null);

  // First-open lazy fetch. Subsequent opens reuse the cached bootstrap;
  // any new messages within the same Sheet lifetime are persisted by the
  // chat itself (the API route writes each turn to SQLite). Closing and
  // reopening will refetch sessions to pick up new titles.
  useEffect(() => {
    if (!open || bootstrap) return;
    let cancelled = false;
    (async () => {
      try {
        const sessions = await listChatSessions();
        const activeSessionId = sessions[0]?.id ?? null;
        const active =
          activeSessionId != null
            ? await getChatSession(activeSessionId)
            : null;
        if (cancelled) return;
        setBootstrap({
          activeSessionId,
          initialMessages: active?.messages ?? [],
          sessions,
        });
      } catch {
        // Auth or DB hiccup — leave bootstrap null so the user sees the
        // loading state and can close+retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, bootstrap]);

  if (pathname?.startsWith("/advisor")) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/*
        Mobile vs desktop:
          • Mobile (<sm) — circular icon-only FAB. The label-pill version
            shipped previously sat on top of in-page CTAs ("Add account",
            "Log spend", form submit buttons) at common screen widths,
            and on iOS extended into the home-indicator area. Shrinking
            to a 48px circle and lifting it via env(safe-area-inset-bottom)
            clears both.
          • Desktop (≥sm) — keeps the original pill with the "Advisor"
            label.
        The fixed positioning still uses bottom-right but the offset
        scales: ~16px from the bottom on desktop, ~16px + safe-area on
        mobile so iOS browsers' bottom chrome doesn't clip it.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open advisor"
        className="fixed right-[calc(env(safe-area-inset-right,0px)+3.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.375rem)] z-50 inline-flex size-11 items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.03] active:scale-[0.98] md:bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:right-[calc(env(safe-area-inset-right,0px)+1rem)] md:top-auto md:h-12 md:w-auto md:px-4"
      >
        <Sparkles className="size-5 md:size-4" />
        <span className="hidden text-sm font-medium md:inline">Advisor</span>
      </button>
      <SheetContent
        side="right"
        className="p-0 w-full sm:max-w-[520px] flex flex-col gap-0"
      >
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-base flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            Advisor
          </SheetTitle>
          <SheetDescription className="text-xs">
            Ask anything, log transactions, or get a runway check — same advisor
            as the dedicated page.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0">
          {bootstrap ? (
            <AdvisorChat
              key={bootstrap.activeSessionId ?? "new"}
              sessionId={bootstrap.activeSessionId}
              initialMessages={bootstrap.initialMessages}
              sessions={bootstrap.sessions}
            />
          ) : (
            <div className="grid place-items-center h-full text-xs text-muted-foreground">
              Loading…
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
