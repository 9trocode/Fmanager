"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

const TRIGGER_DISTANCE = 80; // px the user needs to pull to commit
const MAX_DRAG = 140;        // visual cap so the indicator doesn't fly off
const DAMP = 0.55;            // pull resistance — feels like rubber

/**
 * Custom pull-to-refresh.
 *
 * Mounted once at the app shell. Listens at the window level for
 * single-finger touch gestures, and when the user pulls down while
 * `scrollY === 0`, slides an indicator from the top of the screen.
 * Past the trigger distance + release → calls Next's
 * `router.refresh()` for a soft RSC re-fetch (no full reload), and
 * spins until the transition resolves.
 *
 * Why custom, not browser-native: Chrome's native PTR does a full
 * navigation reload, which throws away React state and re-runs
 * every fetch. `router.refresh()` only re-fetches Server Components
 * and re-streams HTML — same data freshness, none of the white
 * flash. The existing `overscroll-behavior-y: contain` on body
 * already suppresses Chrome's native PTR, so the two don't fight.
 *
 * Activation rules:
 *   - touch capability required (skips desktop entirely)
 *   - only triggers when `window.scrollY === 0` at touchstart
 *     (so pulling down inside a scrolled list doesn't fire)
 *   - single-finger only (multi-touch zooms etc. pass through)
 *   - while refreshing, swallow further pulls — no overlap
 *
 * Refresh values are tracked through refs (the touch handlers run
 * outside React render so closures-over-state would stale within a
 * single gesture). Visual state is mirrored via `setPull` so the
 * indicator renders.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, startRefresh] = useTransition();

  const pullRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const refreshingRef = useRef(false);
  refreshingRef.current = refreshing;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Touch-only feature — desktop has refresh shortcuts already.
    if (!("ontouchstart" in window)) return;

    function reset() {
      startYRef.current = null;
      draggingRef.current = false;
      pullRef.current = 0;
      setPull(0);
    }

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      if (e.touches.length !== 1) return;
      // Only arm when scroll is at the very top — pulling down inside
      // a half-scrolled list shouldn't trigger refresh.
      if (window.scrollY > 0) return;
      startYRef.current = e.touches[0]?.clientY ?? null;
      draggingRef.current = false;
    }

    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current) return;
      if (startYRef.current == null) return;
      if (e.touches.length !== 1) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startYRef.current;
      if (dy <= 0) {
        // User changed direction — release the gesture so a normal
        // upward scroll continues without our indicator flashing.
        if (draggingRef.current) {
          pullRef.current = 0;
          setPull(0);
        }
        return;
      }
      // The user might have scrolled between start and move (rare,
      // but happens when a long-running render finishes mid-gesture).
      // Bail to give the browser back the gesture.
      if (window.scrollY > 0 && !draggingRef.current) return;
      draggingRef.current = true;
      const distance = Math.min(MAX_DRAG, dy * DAMP);
      pullRef.current = distance;
      setPull(distance);
    }

    function onTouchEnd() {
      if (refreshingRef.current) return;
      if (!draggingRef.current) {
        reset();
        return;
      }
      const committed = pullRef.current >= TRIGGER_DISTANCE;
      reset();
      if (committed) {
        startRefresh(() => {
          router.refresh();
        });
      }
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", reset);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, [router]);

  const visible = pull > 0 || refreshing;
  const progress = Math.min(1, pull / TRIGGER_DISTANCE);
  // While refreshing: park the indicator just below the safe-area.
  // While pulling: slide it down with the gesture but cap before
  // it covers content beneath the FAB.
  const translateY = refreshing ? 32 : Math.max(0, pull - 12);

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none fixed left-1/2 top-0 z-50"
      style={{
        // Lift below the iOS status bar / notch in standalone mode.
        marginTop: "env(safe-area-inset-top, 0px)",
        transform: `translate(-50%, ${translateY}px)`,
        opacity: visible ? 1 : 0,
        // Snap-back animation when the gesture releases without a
        // commit; while pulling we want 1:1 with the finger (no
        // transition there — would feel laggy).
        transition: draggingDuration(refreshing, pull),
      }}
    >
      <div className="size-10 rounded-full bg-card border border-border shadow-md grid place-items-center">
        <RefreshCw
          className={"size-4 text-foreground/80 " + (refreshing ? "animate-spin" : "")}
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
            transition: refreshing ? undefined : "transform 0s",
          }}
        />
      </div>
    </div>
  );
}

/**
 * Slide-back animation only when releasing without a commit. While
 * the finger is actively dragging (`pull > 0` and not refreshing),
 * keep transitions off so the indicator tracks the finger 1:1.
 */
function draggingDuration(refreshing: boolean, pull: number): string {
  if (refreshing) return "transform 220ms ease, opacity 220ms ease";
  if (pull > 0) return "opacity 120ms ease";
  return "transform 220ms ease, opacity 220ms ease";
}
