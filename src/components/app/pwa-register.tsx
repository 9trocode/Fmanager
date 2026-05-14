"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` once on mount. Mounted from the root layout so
 * every route gets the SW controlling it. Wrapped in a `useEffect`
 * because `navigator.serviceWorker` is browser-only — touching it in
 * SSR would crash.
 *
 * No registration in dev: turbopack's HMR has churned through too
 * many half-broken-SW situations; the production-only guard avoids
 * having to clear storage every time hot reload swaps a route.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // Surface the failure in the console but never throw —
          // a broken SW registration shouldn't break the app.
          console.error("[pwa] service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      window.addEventListener("load", onLoad, { once: true });
      return () => window.removeEventListener("load", onLoad);
    }
  }, []);

  return null;
}
