"use client";

import { useAppTheme } from "@/components/ThemeProvider";
import type { ThemePref } from "@/lib/color/identity";

const OPTIONS: { value: ThemePref; label: string; icon: string }[] = [
  { value: "dark", label: "Dark", icon: "ph-moon" },
  { value: "light", label: "Light", icon: "ph-sun" },
  { value: "auto", label: "Auto", icon: "ph-circle-half" },
];

/** Compact theme control — applies via ThemeProvider on <html>. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { pref, setPref, theme } = useAppTheme();

  return (
    <div
      className={`inline-flex gap-0.5 rounded-lg border border-divider p-0.5 ${className}`}
      role="group"
      aria-label="Colour theme"
    >
      {OPTIONS.map((o) => {
        const on = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-label={
              o.value === "auto" ? `Auto theme (currently ${theme})` : o.label
            }
            aria-pressed={on}
            title={
              o.value === "auto"
                ? `Auto (${theme}) — follows room light`
                : o.label
            }
            onClick={() => setPref(o.value)}
            className={`grid h-8 w-8 place-items-center rounded-md text-sm transition ${
              on
                ? "bg-accent text-[#141221]"
                : "text-neutral-500 hover:bg-surface hover:text-neutral-300"
            }`}
          >
            <i className={`ph ${o.icon}`} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
