import { describe, expect, it } from "vitest";
import {
  applyFired,
  applyMinimise,
  applyOptimistic,
  applyRemoteState,
  applySnapshot,
  currentAlert,
  initialState,
  PENDING_TTL_MS,
  ReminderStore,
} from "./store";
import type { PanelReminderSnapshot } from "@/lib/reminders/types";

const T0 = Date.parse("2026-09-29T09:30:00Z");
const DUE = "2026-09-29T09:30:00.000Z";

const snapshot = (over: Partial<PanelReminderSnapshot> = {}): PanelReminderSnapshot => ({
  timezone: "Australia/Melbourne",
  date: "2026-09-29",
  agenda: [
    {
      key: "rem_bins@1",
      reminderId: "rem_bins",
      occurrenceId: null,
      title: "Take out the bins",
      details: null,
      dueAt: DUE,
      status: "upcoming",
      snoozedUntil: null,
      assignee: { kind: "kid", id: "kid_gus", name: "Gus" },
      repeat: "Every Tuesday at 7:30 pm",
    },
  ],
  alerts: [],
  members: [],
  serverNow: new Date(T0).toISOString(),
  ...over,
});

const fired = {
  type: "reminder" as const,
  text: "Gus, take out the bins",
  reminderId: "rem_bins",
  occurrenceId: "occ_1",
  title: "Take out the bins",
  assignee: "Gus",
  dueAt: DUE,
  audioUrl: "https://blob/x.mp3",
};

describe("reminder store reducers", () => {
  it("a fired command raises the alert and marks the agenda row due, before any refetch", () => {
    let s = applySnapshot(initialState, snapshot(), T0 - 60_000);
    s = applyFired(s, fired, T0);
    expect(currentAlert(s)?.title).toBe("Take out the bins");
    expect(s.snapshot!.agenda[0]).toMatchObject({ status: "due", occurrenceId: "occ_1" });
  });

  it("ignores a legacy reminder command with no occurrence (the spoken card handles those)", () => {
    const s = applyFired(initialState, { type: "reminder", text: "hi", reminderId: "r" }, T0);
    expect(s).toBe(initialState);
  });

  it("a completion anywhere in the house clears the alert here", () => {
    let s = applyFired(applySnapshot(initialState, snapshot(), T0), fired, T0);
    s = applyRemoteState(s, { type: "reminderState", occurrenceId: "occ_1", reminderId: "rem_bins", status: "COMPLETED", by: "Kitchen" });
    expect(currentAlert(s)).toBeNull();
    expect(s.snapshot!.agenda[0].status).toBe("done");
  });

  it("a snooze elsewhere clears the alert and shows the new time", () => {
    let s = applyFired(applySnapshot(initialState, snapshot(), T0), fired, T0);
    const until = "2026-09-29T09:45:00.000Z";
    s = applyRemoteState(s, { type: "reminderState", occurrenceId: "occ_1", reminderId: "rem_bins", status: "SNOOZED", snoozedUntil: until });
    expect(s.alerts).toEqual([]);
    expect(s.snapshot!.agenda[0]).toMatchObject({ status: "snoozed", snoozedUntil: until });
  });

  it("an optimistic tap survives a stale snapshot that raced it", () => {
    let s = applyFired(applySnapshot(initialState, snapshot(), T0), fired, T0);
    s = applyOptimistic(s, "occ_1", "done", T0 + 100);
    // The poll was read just before the tap, so the server still says ringing.
    const stale = snapshot({
      alerts: [{ occurrenceId: "occ_1", reminderId: "rem_bins", title: "Take out the bins", details: null, dueAt: DUE, firedAt: DUE, assignee: "Gus", late: false }],
      agenda: [{ ...snapshot().agenda[0], occurrenceId: "occ_1", status: "due" }],
    });
    s = applySnapshot(s, stale, T0 + 200);
    expect(currentAlert(s)).toBeNull();
    expect(s.snapshot!.agenda[0].status).toBe("done");
  });

  it("…but not forever: once the TTL passes, the server wins (the tap must have failed)", () => {
    let s = applyOptimistic(applySnapshot(initialState, snapshot(), T0), "occ_1", "done", T0);
    const serverSaysDue = snapshot({ agenda: [{ ...snapshot().agenda[0], occurrenceId: "occ_1", status: "due" }] });
    s = applySnapshot(s, serverSaysDue, T0 + PENDING_TTL_MS + 1);
    expect(s.snapshot!.agenda[0].status).toBe("due");
  });

  it("keeps an alert that arrived live but postdates the snapshot", () => {
    let s = applyFired(initialState, fired, T0);
    s = applySnapshot(s, snapshot(), T0 + 1_000);
    expect(s.alerts).toHaveLength(1);
    s = applySnapshot(s, snapshot(), T0 + 60_000);
    expect(s.alerts).toHaveLength(0);
  });

  it("the live copy's audio survives a snapshot that lists the same alert", () => {
    let s = applyFired(initialState, fired, T0);
    s = applySnapshot(
      s,
      snapshot({ alerts: [{ occurrenceId: "occ_1", reminderId: "rem_bins", title: "Take out the bins", details: null, dueAt: DUE, firedAt: DUE, assignee: "Gus", late: false }] }),
      T0 + 1_000,
    );
    expect(s.alerts[0].audioUrl).toBe("https://blob/x.mp3");
  });

  it("queues several alerts oldest-first, and 'Later' tucks one away", () => {
    let s = applyFired(initialState, fired, T0);
    s = applyFired(s, { ...fired, occurrenceId: "occ_2", title: "Feed the dog" }, T0 + 1_000);
    expect(currentAlert(s)?.occurrenceId).toBe("occ_1");
    s = applyMinimise(s, "occ_1", true);
    expect(currentAlert(s)?.occurrenceId).toBe("occ_2");
  });

  it("a re-fire (snooze ended) brings a tucked-away alert back", () => {
    let s = applyMinimise(applyFired(initialState, fired, T0), "occ_1", true);
    expect(currentAlert(s)).toBeNull();
    s = applyFired(s, fired, T0 + 600_000);
    expect(currentAlert(s)?.occurrenceId).toBe("occ_1");
  });
});

describe("ReminderStore", () => {
  it("notifies subscribers only on change", () => {
    const store = new ReminderStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.update((s) => s);
    store.update((s) => applyFired(s, fired, T0));
    off();
    store.update((s) => applyMinimise(s, "occ_1", true));
    expect(calls).toBe(1);
  });
});
