"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "./Icon";

/**
 * The weather chip in the Utility Strip.
 *
 * A client component so every other Hub screen can stay static: the chip fetches
 * the household's forecast once and then on the same ten-minute cadence as the
 * upstream cache. Until it lands it shows the door without a temperature rather
 * than a guess.
 *
 * Module-scoped so navigating between screens re-uses the last reading instead
 * of blanking the chip on every route change.
 */
let last: { temp: number; place: string; icon: string } | null = null;

const REFRESH_MS = 10 * 60 * 1000;

export default function WeatherChip({ active }: { active?: boolean }) {
  const [now, setNow] = useState(last);

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const res = await fetch("/api/weather", { cache: "no-store" });
        const json = (await res.json()) as {
          forecast: { temp: number; place: string; icon: string } | null;
        };
        if (!alive || !json.forecast) return;
        last = { temp: json.forecast.temp, place: json.forecast.place, icon: json.forecast.icon };
        setNow(last);
      } catch {
        // Keep the last good reading; the chip is a door first and a gauge second.
      }
    };

    void read();
    const id = window.setInterval(read, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <Link
      href="/hub/weather"
      aria-label={now ? `Weather: ${now.temp} degrees in ${now.place}` : "Weather"}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-full px-4 py-2.5 transition-transform active:scale-[0.97] ${
        active ? "bg-accent" : "bg-surface shadow-card"
      }`}
    >
      <Icon
        name={(now?.icon as IconName) ?? "weather"}
        size={18}
        style={{ color: active ? "#FFFFFF" : "var(--color-accent)" }}
      />
      <span className={`text-[13px] font-semibold ${active ? "text-white" : "text-text"}`}>
        {now ? `${now.temp}° ${now.place}` : "Weather"}
      </span>
    </Link>
  );
}
