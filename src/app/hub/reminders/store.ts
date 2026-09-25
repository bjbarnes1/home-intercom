import type { ReminderCommand, ReminderStateCommand } from "@/lib/control/commands";
import type {
  ActiveAlert,
  AgendaItem,
  AgendaStatus,
  PanelReminderSnapshot,
} from "@/lib/reminders/types";

/**
 * The panel's reminder state: one store, three writers.
 *
 *   1. The **server snapshot** (GET /api/endpoint/reminders/today) is the
 *      baseline: polled, and refetched whenever the server says the set of
 *      reminders changed.
 *   2. **Lobby commands** land between polls: `reminder` when something fires
 *      here, `reminderState` when anyone anywhere acts on one. These make the
 *      UI instant; the next snapshot confirms them.
 *   3. **This panel's own taps**, applied optimistically and rolled back if the
 *      server refuses.
 *
 * Every screen reads the same store (useSyncExternalStore), so a reminder that
 * fires while the Music screen is up raises the alert, updates the Home card
 * and ticks the agenda in one render, and Complete in the kitchen clears the
 * same alert in the bedroom within one lobby message.
 *
 * The reducers are pure and exported for tests; the class is the thin mutable
 * shell React subscribes to.
 */

export interface ReminderState {
  snapshot: PanelReminderSnapshot | null;
  /** Ringing here, oldest first. The Triggered Alert shows [0]. */
  alerts: ActiveAlert[];
  /**
   * Occurrences this panel has just acted on and the server has not yet
   * confirmed, with the status they will have. A snapshot that raced the
   * action must not resurrect an alert the person just cleared.
   */
  pending: Record<string, { status: AgendaStatus; at: number }>;
  /** The alert the person tucked away ("Later"); shown as a toast instead. */
  minimised: Record<string, true>;
  lastSyncedAt: number | null;
  error: string | null;
}

export const initialState: ReminderState = {
  snapshot: null,
  alerts: [],
  pending: {},
  minimised: {},
  lastSyncedAt: null,
  error: null,
};

/** How long an unconfirmed local action outranks the server's older view. */
export const PENDING_TTL_MS = 15_000;
/** A live-arrived alert the snapshot doesn't know about yet survives this long. */
const LIVE_GRACE_MS = 30_000;

const STATUS_FOR: Record<ReminderStateCommand["status"], AgendaStatus> = {
  PENDING: "due",
  SNOOZED: "snoozed",
  COMPLETED: "done",
  DISMISSED: "dismissed",
};

// ─── Reducers ──────────────────────────────────────────────────────────────

export function applySnapshot(state: ReminderState, snap: PanelReminderSnapshot, now: number): ReminderState {
  const pending = prunePending(state.pending, now);
  const serverIds = new Set(snap.alerts.map((a) => a.occurrenceId));
  // Keep alerts that arrived live moments ago but postdate this read.
  const liveOnly = state.alerts.filter(
    (a) => !serverIds.has(a.occurrenceId) && now - Date.parse(a.firedAt) < LIVE_GRACE_MS,
  );
  // Prefer the live copy of an alert: it carries the audio URL and spoken line.
  const liveById = new Map(state.alerts.map((a) => [a.occurrenceId, a]));
  const alerts = [...snap.alerts.map((a) => ({ ...a, ...liveById.get(a.occurrenceId) })), ...liveOnly]
    .filter((a) => !pending[a.occurrenceId])
    .sort((a, b) => Date.parse(a.firedAt) - Date.parse(b.firedAt));

  const agenda = snap.agenda.map((item) =>
    item.occurrenceId && pending[item.occurrenceId] ? { ...item, status: pending[item.occurrenceId].status } : item,
  );

  return {
    ...state,
    snapshot: { ...snap, agenda },
    alerts,
    pending,
    minimised: pickKeys(state.minimised, alerts.map((a) => a.occurrenceId)),
    lastSyncedAt: now,
    error: null,
  };
}

/** A `reminder` command arrived: something is ringing on this panel. */
export function applyFired(state: ReminderState, cmd: ReminderCommand, now: number): ReminderState {
  if (!cmd.occurrenceId) return state; // legacy command: the spoken card handles it
  const alert: ActiveAlert = {
    occurrenceId: cmd.occurrenceId,
    reminderId: cmd.reminderId,
    title: cmd.title ?? cmd.text,
    details: cmd.details ?? null,
    dueAt: cmd.dueAt ?? new Date(now).toISOString(),
    firedAt: new Date(now).toISOString(),
    assignee: cmd.assignee ?? null,
    late: !!cmd.late,
    spoken: cmd.text,
    audioUrl: cmd.audioUrl,
  };
  const others = state.alerts.filter((a) => a.occurrenceId !== alert.occurrenceId);
  const { [alert.occurrenceId]: _dropped, ...pending } = state.pending;
  const { [alert.occurrenceId]: _shown, ...minimised } = state.minimised;
  return {
    ...state,
    alerts: [...others, alert],
    pending,
    minimised,
    snapshot: state.snapshot && {
      ...state.snapshot,
      agenda: upsertFired(state.snapshot.agenda, alert),
    },
  };
}

/** Someone, somewhere, changed an occurrence. */
export function applyRemoteState(state: ReminderState, cmd: ReminderStateCommand): ReminderState {
  const status = STATUS_FOR[cmd.status];
  const alerts =
    cmd.status === "PENDING" ? state.alerts : state.alerts.filter((a) => a.occurrenceId !== cmd.occurrenceId);
  const { [cmd.occurrenceId]: _confirmed, ...pending } = state.pending;
  return {
    ...state,
    alerts,
    pending,
    snapshot: state.snapshot && {
      ...state.snapshot,
      agenda: state.snapshot.agenda.map((i) =>
        i.occurrenceId === cmd.occurrenceId ? { ...i, status, snoozedUntil: cmd.snoozedUntil ?? null } : i,
      ),
    },
  };
}

/** This panel acted: show the result now. */
export function applyOptimistic(
  state: ReminderState,
  occurrenceId: string,
  status: AgendaStatus,
  now: number,
  snoozedUntil: string | null = null,
): ReminderState {
  return {
    ...state,
    alerts: state.alerts.filter((a) => a.occurrenceId !== occurrenceId),
    pending: { ...state.pending, [occurrenceId]: { status, at: now } },
    snapshot: state.snapshot && {
      ...state.snapshot,
      agenda: state.snapshot.agenda.map((i) =>
        i.occurrenceId === occurrenceId ? { ...i, status, snoozedUntil } : i,
      ),
    },
  };
}

export function applyMinimise(state: ReminderState, occurrenceId: string, minimised: boolean): ReminderState {
  const { [occurrenceId]: _was, ...rest } = state.minimised;
  return { ...state, minimised: minimised ? { ...rest, [occurrenceId]: true } : rest };
}

/** The alert to put on screen now: the oldest that isn't tucked away. */
export function currentAlert(state: ReminderState): ActiveAlert | null {
  return state.alerts.find((a) => !state.minimised[a.occurrenceId]) ?? null;
}

function upsertFired(agenda: AgendaItem[], alert: ActiveAlert): AgendaItem[] {
  let found = false;
  const next = agenda.map((i) => {
    const same = i.occurrenceId === alert.occurrenceId || (i.reminderId === alert.reminderId && i.dueAt === alert.dueAt);
    if (!same) return i;
    found = true;
    return { ...i, occurrenceId: alert.occurrenceId, status: "due" as const, snoozedUntil: null };
  });
  return found ? next : agenda; // not on today's list (yet): the refetch adds it
}

function prunePending(p: ReminderState["pending"], now: number): ReminderState["pending"] {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => now - v.at < PENDING_TTL_MS));
}

function pickKeys<T>(obj: Record<string, T>, keys: string[]): Record<string, T> {
  const keep = new Set(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => keep.has(k)));
}

// ─── The mutable shell ─────────────────────────────────────────────────────

export class ReminderStore {
  private state: ReminderState = initialState;
  private listeners = new Set<() => void>();

  getState = (): ReminderState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  update(fn: (s: ReminderState) => ReminderState): void {
    const next = fn(this.state);
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l();
  }
}
