"use client";

import { useCallback, useEffect, useState } from "react";
import { reminderTime } from "@/lib/client/speak";
import { useSpeechInput } from "@/lib/client/useSpeechInput";
import type { DeviceRow, ReminderRow, ZoneRow } from "./types";

export default function RemindersPanel({
  zones,
  devices,
}: {
  zones: ZoneRow[];
  devices: DeviceRow[];
}) {
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/reminders");
    if (res.ok) setReminders((await res.json()).reminders ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (creating) {
    return (
      <NewReminder
        zones={zones}
        devices={devices}
        onDone={() => {
          setCreating(false);
          load();
        }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <>
      <header className="mb-4 flex items-end justify-between">
        <div>
          <h1 className="m-0 text-2xl">Reminders</h1>
          <div className="text-xs text-neutral-500">
            Spoken on the rooms you choose
          </div>
        </div>
        <button onClick={() => setCreating(true)} className="btn btn-secondary min-h-9 text-xs">
          <i className="ph ph-plus" />
          Manual
        </button>
      </header>

      <AskReminder onCreated={load} />

      {reminders.length === 0 && (
        <div className="py-16 text-center text-neutral-500">
          <i className="ph ph-bell-simple mb-2 block text-3xl text-accent-400" />
          <div className="text-sm">No reminders yet.</div>
        </div>
      )}
      <div className="flex flex-col">
        {reminders.map((r) => (
          <div
            key={r.id}
            className="flex items-start gap-3 border-b border-divider py-3"
          >
            <div className="w-14 flex-none font-heading text-[15px] font-medium text-accent-300">
              {reminderTime(r)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm leading-snug">{r.text}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {r.cron ? `Repeats · ${r.cron}` : "Once"}
              </div>
            </div>
            <span className={`tag ${r.enabled ? "tag-accent" : "tag-neutral"}`}>
              {r.enabled ? "On" : "Off"}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function AskReminder({ onCreated }: { onCreated: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const { supported, listening, start, stop } = useSpeechInput((t) => setText(t));

  async function submit() {
    if (!text.trim()) return;
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/reminders/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(typeof data.error === "string" ? data.error : "Couldn't set that.");
        return;
      }
      setNote(`✓ ${data.confirmation ?? "Reminder set."}`);
      setText("");
      onCreated();
    } catch {
      setNote("Couldn't set that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mb-5 p-3">
      <div className="uplabel mb-2 flex items-center gap-1.5 text-accent">
        <i className="ph-fill ph-sparkle" />
        Ask in plain words
      </div>
      <textarea
        className="input min-h-16"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Remind Willoughby to read his novel at 4pm tomorrow"
      />
      <div className="mt-2 flex items-center gap-2">
        {supported && (
          <button
            onClick={listening ? stop : start}
            className={`btn min-h-10 px-3 ${listening ? "btn-outline" : "btn-secondary"}`}
            aria-label="Dictate"
          >
            <i className={`ph-fill ${listening ? "ph-stop" : "ph-microphone"} text-base`} />
            {listening ? "Listening…" : "Speak"}
          </button>
        )}
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="btn btn-primary min-h-10 flex-1"
        >
          {busy ? "Setting…" : "Set reminder"}
        </button>
      </div>
      {note && <p className="mt-2 text-sm text-neutral-300">{note}</p>}
    </div>
  );
}

function NewReminder({
  zones,
  devices,
  onDone,
  onCancel,
}: {
  zones: ZoneRow[];
  devices: DeviceRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [target, setTarget] = useState<{ zoneId?: string; deviceId?: string }>({});
  const [time, setTime] = useState("15:30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const targets: { key: string; name: string; zoneId?: string; deviceId?: string }[] = [
    ...zones.map((z) => ({ key: `z:${z.id}`, name: z.name, zoneId: z.id })),
    ...devices.map((d) => ({
      key: `d:${d.id}`,
      name: d.displayName,
      deviceId: d.id,
    })),
  ];
  const picked = target.zoneId
    ? `z:${target.zoneId}`
    : target.deviceId
      ? `d:${target.deviceId}`
      : "";

  async function save() {
    if (!text.trim() || !picked) {
      setError("Add text and pick where it plays.");
      return;
    }
    setBusy(true);
    setError("");
    const [h, m] = time.split(":");
    const cron = `${parseInt(m, 10)} ${parseInt(h, 10)} * * *`;
    const res = await fetch("/api/reminders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: text.trim(),
        kind: "RECURRING",
        cron,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        ...target,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(typeof d.error === "string" ? d.error : "Couldn't save");
      return;
    }
    onDone();
  }

  return (
    <>
      <header className="mb-4 flex items-center gap-2">
        <button onClick={onCancel} className="btn btn-ghost min-h-9 px-2">
          <i className="ph ph-caret-left text-lg" />
        </button>
        <div className="flex-1 font-heading text-lg font-medium">New reminder</div>
        <button onClick={save} disabled={busy} className="btn btn-primary min-h-9 text-xs">
          {busy ? "Saving…" : "Save"}
        </button>
      </header>

      <div className="field mb-4">
        <label>What should it say?</label>
        <textarea
          className="input min-h-16"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Teeth and pyjamas, please."
        />
      </div>

      <div className="uplabel mb-2">Play on</div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {targets.map((t) => {
          const on = picked === t.key;
          return (
            <button
              key={t.key}
              onClick={() =>
                setTarget(t.zoneId ? { zoneId: t.zoneId } : { deviceId: t.deviceId })
              }
              className={`rounded-full px-3 py-1.5 text-[13px] transition ${
                on
                  ? "bg-accent text-[#141221]"
                  : "border border-divider text-neutral-300 hover:border-accent"
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>

      <div className="uplabel mb-2">Time</div>
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="input mb-4"
      />

      {error && <p className="text-sm text-accent-200">{error}</p>}
      <div className="text-[11px] text-neutral-600">
        Chime, then speak. Voice rendered at home, never in the cloud. Offline
        rooms get it when they reconnect.
      </div>
    </>
  );
}
