"use client";

import NextScript from "next/script";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Minimal theme provider.
 *
 * Why not `next-themes`?
 *   `next-themes` injects an inline FOUC script via React.createElement
 *   inside `<body>`. React 19 emits the warning:
 *     "Encountered a script tag while rendering React component …
 *      scripts inside React components are never executed when rendering
 *      on the client."
 *   That warning fires for ANY <script> rendered through React, regardless
 *   of where in the tree it lives — including <head>. There's no flag in
 *   next-themes to disable its inline script, so the warning is permanent
 *   while we use it.
 *
 *   This module replaces it with a thin equivalent: a Server Component
 *   `<ThemeInitScript>` that emits the FOUC script directly into the SSR'd
 *   HTML (only runs on initial server render — never re-rendered on the
 *   client, so React 19 doesn't warn), plus a client `<ThemeProvider>` that
 *   exposes the same `useTheme()` shape consumers already use:
 *     `{ theme, setTheme, resolvedTheme }`.
 */

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "theme";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: Resolved;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Render this once in the root layout (place it inside `<body>`, before
 * any other content). Uses `next/script` with `strategy="beforeInteractive"`
 * so Next injects the script into the document head OUTSIDE of React's
 * render tree. That sidesteps React 19's "Encountered a script tag while
 * rendering React component" warning, which fires for ANY <script> element
 * rendered through JSX — even one in <head> of a server component.
 */
export function ThemeInitScript({
  defaultTheme = "dark",
}: {
  defaultTheme?: Theme;
}) {
  const script = `(function(){try{var s=localStorage.getItem('${STORAGE_KEY}')||'${defaultTheme}';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var t=s==='system'?sys:s;var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(t);d.style.colorScheme=t;}catch(e){}})();`;
  return (
    <NextScript
      id="theme-init"
      strategy="beforeInteractive"
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  // Read the user's stored preference lazily; SSR returns the default.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return defaultTheme;
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  // Resolved = the *concrete* theme actually applied right now (system
  // resolves to light or dark via the OS preference).
  const [resolvedTheme, setResolvedTheme] = useState<Resolved>(() => {
    if (typeof window === "undefined") {
      return defaultTheme === "light" ? "light" : "dark";
    }
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return theme;
  });

  // Apply class to <html> whenever theme changes, and persist.
  useEffect(() => {
    const root = document.documentElement;
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next: Resolved = theme === "system" ? (sysDark ? "dark" : "light") : theme;
    root.classList.remove("light", "dark");
    root.classList.add(next);
    root.style.colorScheme = next;
    setResolvedTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore quota / private-mode failures.
    }
  }, [theme]);

  // Live-update on OS preference change while in "system" mode.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const next: Resolved = e.matches ? "dark" : "light";
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(next);
      root.style.colorScheme = next;
      setResolvedTheme(next);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Cross-tab sync: another tab changed the stored theme — follow.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = (e.newValue as Theme | null) ?? defaultTheme;
      setThemeState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [defaultTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Same shape as `next-themes`' `useTheme()`. Returns sensible defaults if
 * called outside a provider so SSR / story renders don't crash.
 */
export function useTheme(): ThemeContextValue {
  return (
    useContext(ThemeContext) ?? {
      theme: "dark",
      setTheme: () => {},
      resolvedTheme: "dark",
    }
  );
}
