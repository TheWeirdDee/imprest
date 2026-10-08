"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "imprest.theme";

/**
 * Runs in <head> before first paint (see app/layout.tsx) so a dark-mode user never sees a
 * light flash. Kept tiny and dependency-free; the provider below takes over after hydration.
 */
export const themeInitScript = `(function(){try{var c=localStorage.getItem("${THEME_KEY}");if(c!=="light"&&c!=="dark")c="system";var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.dataset.themeChoice=c}catch(e){document.documentElement.dataset.theme="light"}})();`;

interface Ctx {
  choice: ThemeChoice;
  resolved: "light" | "dark";
  setChoice: (c: ThemeChoice) => void;
}
const ThemeCtx = createContext<Ctx | null>(null);

function systemDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function apply(choice: ThemeChoice): "light" | "dark" {
  const resolved = choice === "dark" || (choice === "system" && systemDark()) ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themeChoice = choice;
  return resolved;
}

function read(): ThemeChoice {
  try {
    const c = localStorage.getItem(THEME_KEY);
    return c === "light" || c === "dark" ? c : "system";
  } catch {
    return "system";
  }
}

/** Theme state only: changing it never touches the account session or any other storage. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const c = read();
    setChoiceState(c);
    setResolved(apply(c));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (read() === "system") setResolved(apply("system"));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_KEY) return;
      const n = read();
      setChoiceState(n);
      setResolved(apply(n));
    };
    mq.addEventListener("change", onSystem);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onSystem);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setChoice = useCallback((c: ThemeChoice) => {
    try {
      if (c === "system") localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, c);
    } catch {
      /* storage blocked: still applies for this page */
    }
    setChoiceState(c);
    setResolved(apply(c));
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme outside ThemeProvider");
  return c;
}
