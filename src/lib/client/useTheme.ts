"use client";

import { useCallback, useEffect, useState } from "react";
import {
  resolveTheme,
  type Theme,
  type ThemePref,
} from "@/lib/color/identity";

const STORAGE_KEY = "hi-theme-pref";

function readPref(): ThemePref {
  if (typeof window === "undefined") return "dark";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  return "dark";
}

/**
 * Room/panel theme. Pref is stored locally; `auto` follows Ambient Light Sensor
 * with the handoff dead band (60–120 lux). Applies `data-theme` on <html>.
 */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>("dark");
  const [theme, setTheme] = useState<Theme>("dark");
  const [lux, setLux] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefState(readPref());
    setReady(true);
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (!ready || pref !== "auto") return;
    type SensorCtor = new () => {
      start: () => void;
      stop: () => void;
      addEventListener: (type: string, fn: () => void) => void;
      removeEventListener: (type: string, fn: () => void) => void;
      illuminance: number;
    };
    const Sensor = (window as unknown as { AmbientLightSensor?: SensorCtor })
      .AmbientLightSensor;
    if (!Sensor) return;

    let sensor: InstanceType<SensorCtor> | null = null;
    const onReading = () => {
      if (sensor) setLux(sensor.illuminance);
    };
    try {
      sensor = new Sensor();
      sensor.addEventListener("reading", onReading);
      sensor.start();
    } catch {
      /* permission / unsupported */
    }
    return () => {
      if (!sensor) return;
      sensor.removeEventListener("reading", onReading);
      try {
        sensor.stop();
      } catch {
        /* ignore */
      }
    };
  }, [pref, ready]);

  useEffect(() => {
    if (!ready) return;
    setTheme((current) => {
      const next = resolveTheme(pref, lux, current);
      document.documentElement.setAttribute("data-theme", next);
      document.documentElement.style.colorScheme = next;
      return next;
    });
  }, [pref, lux, ready]);

  return { pref, setPref, theme, lux, ready };
}
