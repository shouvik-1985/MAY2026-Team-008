import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "campusverse-theme";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveInitialTheme(): ThemeMode {
  if (typeof window !== "undefined") {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  }
  return "light";
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.remove("light");
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
    root.classList.add("light");
  }
  root.dataset.theme = theme;
  document.body.dataset.theme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(resolveInitialTheme);

  useLayoutEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.classList.remove("theme-pending");
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
