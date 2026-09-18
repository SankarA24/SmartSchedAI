import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "theme";
const THEMES = ["light", "dark"];

/** Resolve the theme to use on first paint: saved choice, else OS preference, else dark. */
export function getInitialTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (THEMES.includes(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  try {
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    /* matchMedia unavailable */
  }
  return "dark";
}

/** Apply a theme to <html> (class-based dark mode) and remember it. */
export function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : "dark";
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  root.style.colorScheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable */
  }
  return next;
}

/** React hook: current theme plus setters. Keeps <html> in sync. */
export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggle, isDark: theme === "dark" };
}
