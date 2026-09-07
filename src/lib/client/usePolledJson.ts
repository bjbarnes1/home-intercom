"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceSecret } from "@/lib/client/identity";

/**
 * Poll a device-authenticated JSON endpoint while `enabled`. Used by the wall
 * panel for schedule / jobs / reminders / music so each rail doesn't reinvent
 * the secret-header + interval loop.
 *
 * `select` is read from a ref so callers can pass an inline mapper without
 * resetting the poll interval every render.
 */
export function useDevicePolledJson<T>(
  enabled: boolean,
  path: string,
  intervalMs: number,
  select: (json: unknown) => T,
): { data: T | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const selectRef = useRef(select);
  selectRef.current = select;

  const reload = useCallback(async () => {
    const secret = getDeviceSecret();
    if (!secret) return;
    const res = await fetch(path, { headers: { "x-device-secret": secret } });
    if (!res.ok) return;
    setData(selectRef.current(await res.json()));
  }, [path]);

  useEffect(() => {
    if (!enabled) return;
    reload();
    const t = setInterval(reload, intervalMs);
    return () => clearInterval(t);
  }, [enabled, intervalMs, reload]);

  return { data, reload };
}
