"use client";

import { useEffect, useState } from "react";

/**
 * The Hub's clock.
 *
 * It owns the whole screen, so it has to be right. It ticks on the minute
 * rather than the second — nothing here shows seconds, and a wall panel left on
 * for months should not wake up sixty times a minute to redraw the same glyphs.
 *
 * Rendered only once mounted. The server has no idea what time it is in this
 * kitchen, and a clock that shows the build's time for a moment and then jumps
 * is worse than one that arrives a frame late.
 */
export interface Now {
  time: string;
  date: string;
  greeting: string;
}

export function greetingFor(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good night";
}

export function readClock(at: Date = new Date()): Now {
  return {
    time: at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }),
    date: at.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }),
    greeting: greetingFor(at.getHours()),
  };
}

export function useNow(): Now | null {
  const [now, setNow] = useState<Now | null>(null);

  useEffect(() => {
    const tick = () => setNow(readClock());
    tick();

    // Line up with the next minute boundary, then every minute after, so the
    // display changes when the clock does rather than up to 59s late.
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000));

    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return now;
}
