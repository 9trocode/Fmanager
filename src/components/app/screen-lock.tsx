"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { verifyAdminPassword } from "@/lib/actions/screen-lock";
import { PasswordInput } from "@/components/app/password-input";

const LOCK_FLAG_KEY = "ff:screen-locked";
// Reset throttle: don't update the activity timestamp more than
// once every N ms even on a steady stream of mousemove events.
const ACTIVITY_THROTTLE_MS = 1000;

/**
 * In-app screen lock. Two affordances:
 *
 *   1. Idle lock — after `idleMinutes` of no mouse/keyboard input,
 *      the lock overlay covers the page. Set 0 (or pass null) to
 *      disable. Idle is tracked client-side only; the server
 *      session stays valid throughout, so unlocking is a fast
 *      password match against the cached admin hash, not a fresh
 *      login.
 *
 *   2. Panic mode — Cmd/Ctrl+Shift+L (or the explicit panic button
 *      mounted elsewhere) immediately triggers a logout + redirect
 *      to `panicRedirectUrl` (default /login). Used to bail in a
 *      hurry when someone walks up. Distinct from the soft lock —
 *      this kills the session and tries to leave behind a benign
 *      destination in the tab.
 *
 * The lock state persists across reloads via localStorage so a
 * refresh while locked keeps the overlay up.
 */
export function ScreenLockProvider({
  children,
  idleMinutes,
  panicRedirectUrl,
}: {
  children: React.ReactNode;
  idleMinutes: number;
  panicRedirectUrl: string;
}) {
  const [locked, setLocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(LOCK_FLAG_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Stable lock function; persists the locked state so a refresh
  // while away keeps the overlay up.
  const lock = useCallback(() => {
    try {
      localStorage.setItem(LOCK_FLAG_KEY, "1");
    } catch {}
    setLocked(true);
  }, []);

  const unlock = useCallback(() => {
    try {
      localStorage.removeItem(LOCK_FLAG_KEY);
    } catch {}
    setLocked(false);
  }, []);

  // Idle tracking. Reset the timer on any "user is here" signal.
  // Throttled write to lastActivity ref; the actual locking decision
  // runs in a setInterval so it isn't tied to event frequency.
  const lastActivityRef = useRef<number>(Date.now());
  const lastWriteRef = useRef<number>(0);
  useEffect(() => {
    if (idleMinutes <= 0) return;
    const idleMs = idleMinutes * 60 * 1000;
    const reset = () => {
      const now = Date.now();
      if (now - lastWriteRef.current < ACTIVITY_THROTTLE_MS) return;
      lastWriteRef.current = now;
      lastActivityRef.current = now;
    };
    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];
    for (const e of events)
      window.addEventListener(e, reset, { passive: true });
    const tick = window.setInterval(() => {
      if (locked) return;
      if (Date.now() - lastActivityRef.current >= idleMs) {
        lock();
      }
    }, 30 * 1000);
    return () => {
      for (const e of events) window.removeEventListener(e, reset);
      window.clearInterval(tick);
    };
  }, [idleMinutes, locked, lock]);

  // Panic shortcut + manual-lock shortcut.
  // Cmd/Ctrl+Shift+L → soft lock
  // Cmd/Ctrl+Shift+P → panic (logout + redirect)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key === "L" || e.key === "l") {
        e.preventDefault();
        lock();
      } else if (e.key === "P" || e.key === "p") {
        e.preventDefault();
        triggerPanic(panicRedirectUrl);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lock, panicRedirectUrl]);

  return (
    <>
      {children}
      {locked ? (
        <LockOverlay
          onUnlock={unlock}
          onPanic={() => triggerPanic(panicRedirectUrl)}
        />
      ) : null}
    </>
  );
}

/**
 * Trigger logout via the existing /api/auth/logout endpoint, then
 * navigate to the panic URL. We use location.replace so the locked
 * page isn't in browser history.
 */
function triggerPanic(url: string) {
  // Fire-and-forget; navigation happens regardless. If the logout
  // POST fails, the session cookie is still there but the user is
  // already gone from the page.
  void fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  try {
    localStorage.removeItem(LOCK_FLAG_KEY);
  } catch {}
  window.location.replace(url || "/login");
}

function LockOverlay({
  onUnlock,
  onPanic,
}: {
  onUnlock: () => void;
  onPanic: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await verifyAdminPassword(password);
      if (r.ok) {
        onUnlock();
        setPassword("");
        toast.success("Unlocked.");
      } else {
        setError("Password didn't match.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-background/90 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Screen locked"
    >
      <div className="w-full max-w-sm space-y-5 px-6">
        <div className="space-y-2 text-center">
          <div className="size-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center mx-auto">
            <Lock className="size-5" />
          </div>
          <h2 className="text-lg font-semibold">Screen locked</h2>
          <p className="text-xs text-muted-foreground">
            Your data is hidden. Enter your admin password to continue.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <PasswordInput
            id="lock-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="current-password"
            error={error ?? null}
          />
          <Button
            type="submit"
            className="w-full"
            disabled={busy || password.length === 0}
          >
            <Lock className="size-4" />
            {busy ? "Verifying…" : "Unlock"}
          </Button>
        </form>
        <button
          type="button"
          onClick={onPanic}
          className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
        >
          <ShieldAlert className="size-3.5" />
          Sign out & leave (panic)
        </button>
      </div>
    </div>
  );
}

/**
 * Icon-only Lock button for the sidebar footer. Reload-based so the
 * provider's init reads the LS flag fresh and shows the overlay.
 * (We could expose a context-based lock fn instead, but reload is
 * one fewer moving part and the lock screen always re-fetches state
 * from the server anyway.)
 */
export function LockNowButton() {
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem(LOCK_FLAG_KEY, "1");
        } catch {}
        window.location.reload();
      }}
      title="Lock screen (⌘⇧L)"
      aria-label="Lock screen"
      className="size-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
    >
      <Lock className="size-4" />
    </button>
  );
}

export function PanicButton({ redirectUrl }: { redirectUrl: string }) {
  return (
    <button
      type="button"
      onClick={() => triggerPanic(redirectUrl)}
      title="Sign out & leave instantly (⌘⇧P)"
      aria-label="Panic — sign out and leave"
      className="size-8 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
    >
      <ShieldAlert className="size-4" />
    </button>
  );
}
