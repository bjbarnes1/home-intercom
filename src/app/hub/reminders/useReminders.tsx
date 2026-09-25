"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getDeviceSecret } from "@/lib/client/identity";
import { reportClientError } from "@/lib/client/reportError";
import type { ReminderCommand, ReminderStateCommand } from "@/lib/control/commands";
import type { SnoozeRequest } from "@/lib/reminders/snooze";
import type { ParseOutcome } from "@/lib/reminders/ai/parser";
import type {
  AgendaStatus,
  CreateReminderInput,
  OccurrenceActionInput,
  PanelReminderSnapshot,
} from "@/lib/reminders/types";
import {
  applyFired,
  applyMinimise,
  applyOptimistic,
  applyRemoteState,
  applySnapshot,
  ReminderStore,
  type ReminderState,
} from "./store";

/**
 * Wiring between the reminder store, the server and the lobby.
 *
 * HubRuntime owns one of these for the life of the panel (so a reminder can
 * fire whatever screen is up) and hands the lobby's reminder commands to it.
 * Screens read it with `useReminders()`.
 */

/** Baseline poll. Live changes arrive over the lobby; this is the safety net. */
const POLL_MS = 60_000;
/** Coalesce a burst of "changed" messages into one refetch. */
const REFRESH_DEBOUNCE_MS = 400;

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface RemindersApi {
  state: ReminderState;
  refresh: () => Promise<void>;
  complete: (occurrenceId: string) => Promise<ActionResult>;
  dismiss: (occurrenceId: string) => Promise<ActionResult>;
  snooze: (occurrenceId: string, req: SnoozeRequest) => Promise<ActionResult>;
  minimise: (occurrenceId: string, minimised: boolean) => void;
  parse: (text: string) => Promise<ParseOutcome | { error: string }>;
  create: (input: CreateReminderInput) => Promise<ActionResult>;
  createOpen: boolean;
  openCreate: () => void;
  closeCreate: () => void;
}

export interface ReminderRuntime extends RemindersApi {
  /** Lobby handlers — HubRuntime passes these to usePanelPresence. */
  onFired: (cmd: ReminderCommand) => void;
  onState: (cmd: ReminderStateCommand) => void;
  onChanged: () => void;
}

const Ctx = createContext<RemindersApi | null>(null);

export function RemindersProvider({ value, children }: { value: RemindersApi; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReminders(): RemindersApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useReminders must be used inside HubRuntime");
  return v;
}

async function deviceFetch(path: string, init?: RequestInit): Promise<Response> {
  const secret = getDeviceSecret();
  if (!secret) throw new Error("This panel isn't paired");
  return fetch(path, {
    ...init,
    headers: { "content-type": "application/json", "x-device-secret": secret, ...(init?.headers ?? {}) },
  });
}

async function errorFrom(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : "That didn't work. Try again.";
}

export function useReminderRuntime(enabled: boolean): ReminderRuntime {
  const storeRef = useRef<ReminderStore | null>(null);
  storeRef.current ??= new ReminderStore();
  const store = storeRef.current;
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await deviceFetch("/api/endpoint/reminders/today");
      if (!res.ok) return;
      const snap = (await res.json()) as PanelReminderSnapshot;
      store.update((s) => applySnapshot(s, snap, Date.now()));
    } catch (e) {
      // Offline for a moment: keep showing the last good state.
      reportClientError(e, { code: "reminders.refresh", route: "useReminderRuntime" });
    }
  }, [store]);

  const refreshTimer = useRef<number | undefined>(undefined);
  const refreshSoon = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const t = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    window.addEventListener("online", refreshSoon);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(refreshTimer.current);
      window.removeEventListener("online", refreshSoon);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh, refreshSoon]);

  /** Apply a tap now, send it, and put things back if the server says no. */
  const act = useCallback(
    async (occurrenceId: string, body: OccurrenceActionInput, optimistic: AgendaStatus): Promise<ActionResult> => {
      const before = store.getState();
      store.update((s) => applyOptimistic(s, occurrenceId, optimistic, Date.now()));
      try {
        const res = await deviceFetch(`/api/endpoint/reminders/occurrences/${encodeURIComponent(occurrenceId)}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const error = await errorFrom(res);
          store.update(() => before);
          void refresh();
          return { ok: false, error };
        }
        const result = (await res.json()) as { snoozedUntil: string | null };
        if (result.snoozedUntil) {
          store.update((s) => applyOptimistic(s, occurrenceId, "snoozed", Date.now(), result.snoozedUntil));
        }
        return { ok: true };
      } catch (e) {
        store.update(() => before);
        reportClientError(e, { code: "reminders.act", route: "useReminderRuntime" });
        return { ok: false, error: "No connection. Try again in a moment." };
      }
    },
    [store, refresh],
  );

  const complete = useCallback((id: string) => act(id, { action: "complete" }, "done"), [act]);
  const dismiss = useCallback((id: string) => act(id, { action: "dismiss" }, "dismissed"), [act]);
  const snooze = useCallback(
    (id: string, req: SnoozeRequest) => act(id, { action: "snooze", snooze: req }, "snoozed"),
    [act],
  );
  const minimise = useCallback(
    (id: string, m: boolean) => store.update((s) => applyMinimise(s, id, m)),
    [store],
  );

  const parse = useCallback(async (text: string) => {
    try {
      const res = await deviceFetch("/api/endpoint/reminders/parse", { method: "POST", body: JSON.stringify({ text }) });
      if (!res.ok) return { error: await errorFrom(res) };
      return (await res.json()) as ParseOutcome;
    } catch {
      return { error: "No connection. Fill it in below instead." };
    }
  }, []);

  const create = useCallback(
    async (input: CreateReminderInput): Promise<ActionResult> => {
      try {
        const res = await deviceFetch("/api/endpoint/reminders", { method: "POST", body: JSON.stringify(input) });
        if (!res.ok) return { ok: false, error: await errorFrom(res) };
        void refresh();
        return { ok: true };
      } catch {
        return { ok: false, error: "No connection. Try again in a moment." };
      }
    },
    [refresh],
  );

  const onFired = useCallback(
    (cmd: ReminderCommand) => {
      store.update((s) => applyFired(s, cmd, Date.now()));
      refreshSoon();
    },
    [store, refreshSoon],
  );
  const onState = useCallback(
    (cmd: ReminderStateCommand) => store.update((s) => applyRemoteState(s, cmd)),
    [store],
  );

  const openCreate = useCallback(() => setCreateOpen(true), []);
  const closeCreate = useCallback(() => setCreateOpen(false), []);

  return useMemo(
    () => ({
      state,
      refresh,
      complete,
      dismiss,
      snooze,
      minimise,
      parse,
      create,
      createOpen,
      openCreate,
      closeCreate,
      onFired,
      onState,
      onChanged: refreshSoon,
    }),
    [state, refresh, complete, dismiss, snooze, minimise, parse, create, createOpen, openCreate, closeCreate, onFired, onState, refreshSoon],
  );
}
