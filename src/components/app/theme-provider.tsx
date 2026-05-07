"use client";

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
 * Why the bespoke implementation?
 *   `next-themes` (and any equivalent) injects an inline FOUC script via
 *   React.createElement. React 19 emits the warning:
 *     "Encountered a script tag while rendering React component …
 *      scripts inside React components are never executed when rendering
 *      on the client."
 *   That warning fires for ANY <script> rendered through React — even via
 *   `next/script` `beforeInteractive` and even when rendered inside <head>.
 *   No flag silences it while a script is in the React tree.
 *
 *   This module avoids the issue entirely by NOT rendering a script. The
 *   server reads the saved theme from a cookie in the root layout and bakes
 *   `class="light"` or `class="dark"` directly into <html>. ThemeProvider
 *   mirrors any change back to the cookie + localStorage so the next SSR
 *   stays in sync. Net result: no script, no warning, no flash.
 */

type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "theme";
// Long-lived theme cookie — small (≤6 chars), HttpOnly off so the client
// can mirror updates, SameSite=Lax for normal navigation, max-age 1 year.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: Resolved;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function writeCookie(theme: Theme) {
  if (typeof document === "undefined") return;
  document.cookie = `${STORAGE_KEY}=${theme}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
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

  // Apply class to <html> whenever theme changes, persist to localStorage,
  // and mirror to the cookie so the next SSR can read it back.
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
    // The cookie carries the *concrete* (resolved) theme so the server can
    // apply it directly without needing matchMedia. "system" → resolved.
    writeCookie(next);
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
      writeCookie(next);
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
