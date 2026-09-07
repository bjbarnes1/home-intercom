"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTheme } from "@/lib/client/useTheme";
import type { Theme, ThemePref } from "@/lib/color/identity";

interface ThemeContextValue {
  pref: ThemePref;
  setPref: (next: ThemePref) => void;
  theme: Theme;
  lux: number;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useTheme();
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useAppTheme must be used within ThemeProvider");
  }
  return ctx;
}
