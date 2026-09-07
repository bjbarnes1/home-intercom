"use client";

import { useCallback, useEffect, useState } from "react";
import type { MusicActionRequest } from "@/lib/music/actions";
import { identStyle } from "@/lib/color/identity";
import type { DeviceRow } from "./types";

interface CalEvent {
  id: string;
  title: string;
  startsAt: string;
  who: string | null;
  allDay: boolean;
}

interface KidRow {
  id: string;
  name: string;
  chores: { id: string; label: string }[];
}

interface MusicState {
  source: string;
  isPlaying: boolean;
  rooms: string[];
  track: { title: string; artist: string };
  availableRooms: { id: string; displayName: string }[];
}

type Section = "schedule" | "jobs" | "music";

/**
 * Parent-phone CRUD for Schedule, Jobs, and Music.
 */
export default function HouseholdPanel({ devices }: { devices: DeviceRow[] }) {
  const [section, setSection] = useState<Section>("schedule");

  return (
    <>
      <header className="mb-4">
        <h1 className="m-0 text-2xl">Household</h1>
        <div className="text-xs text-neutral-500">
          Edit what the wall panels show
        </div>
      </header>
      <div className="mb-4 flex gap-1.5">
        {(
          [
            ["schedule", "Schedule"],
            ["jobs", "Jobs"],
            ["music", "Music"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`btn min-h-9 flex-1 text-xs ${
              section === key ? "btn-primary" : "btn-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {section === "schedule" && <ScheduleEditor />}
      {section === "jobs" && <JobsEditor />}
      {section === "music" && <MusicEditor devices={devices} />}
    </>
  );
}

function ScheduleEditor() {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [title, setTitle] = useState("");
  const [when, setWhen] = useState("");
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/controller/schedule");
    if (res.ok) setEvents((await res.json()).events ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!title.trim() || !when) return;
    setBusy(true);
    const startsAt = new Date(when).toISOString();
    await fetch("/api/controller/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        startsAt,
        who: who.trim() || null,
      }),
    });
    setTitle("");
    setWho("");
    setBusy(false);
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/controller/schedule/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="card mb-4 space-y-2 p-3">
        <input
          className="input"
          placeholder="Event title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="datetime-local"
          className="input"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <input
          className="input"
          placeholder="Who (optional)"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        />
        <button
          onClick={add}
          disabled={busy || !title.trim() || !when}
          className="btn btn-primary w-full min-h-10"
        >
          Add event
        </button>
      </div>
      <div className="flex flex-col">
        {events.map((e) => (
          <div
            key={e.id}
            className="flex items-start gap-2 border-b border-divider py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{e.title}</div>
              <div className="text-[11px] text-neutral-500">
                {e.allDay
                  ? "All day"
                  : new Date(e.startsAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                {e.who ? ` · ${e.who}` : ""}
              </div>
            </div>
            <button
              onClick={() => remove(e.id)}
              className="btn btn-ghost min-h-8 px-2 text-xs text-neutral-500"
              aria-label="Delete event"
            >
              <i className="ph ph-trash" />
            </button>
          </div>
        ))}
        {events.length === 0 && (
          <div className="py-8 text-center text-sm text-neutral-500">
            No upcoming events.
          </div>
        )}
      </div>
    </div>
  );
}

function JobsEditor() {
  const [kids, setKids] = useState<KidRow[]>([]);
  const [kidName, setKidName] = useState("");
  const [choreLabel, setChoreLabel] = useState("");
  const [choreKid, setChoreKid] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/controller/jobs");
    if (res.ok) {
      const data = await res.json();
      setKids(data.kids ?? []);
      setChoreKid((prev) => prev || data.kids?.[0]?.id || "");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function addKid() {
    if (!kidName.trim()) return;
    await fetch("/api/controller/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "kid", name: kidName.trim() }),
    });
    setKidName("");
    load();
  }

  async function addChore() {
    if (!choreLabel.trim() || !choreKid) return;
    await fetch("/api/controller/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "chore",
        kidId: choreKid,
        label: choreLabel.trim(),
      }),
    });
    setChoreLabel("");
    load();
  }

  async function removeChore(id: string) {
    await fetch(`/api/controller/jobs/${id}?type=chore`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="card mb-3 flex gap-2 p-3">
        <input
          className="input flex-1"
          placeholder="Add child"
          value={kidName}
          onChange={(e) => setKidName(e.target.value)}
        />
        <button onClick={addKid} className="btn btn-secondary min-h-10 px-3">
          Add
        </button>
      </div>
      <div className="card mb-4 space-y-2 p-3">
        <select
          className="input"
          value={choreKid}
          onChange={(e) => setChoreKid(e.target.value)}
        >
          {kids.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="New chore"
            value={choreLabel}
            onChange={(e) => setChoreLabel(e.target.value)}
          />
          <button onClick={addChore} className="btn btn-secondary min-h-10 px-3">
            Add
          </button>
        </div>
      </div>
      {kids.map((k) => (
        <div key={k.id} className="mb-4">
          <div
            className="hi-tinted mb-1 font-heading text-[15px] font-medium"
            style={identStyle(k.name)}
          >
            <span style={{ color: "var(--hi-ident)" }}>{k.name}</span>
          </div>
          {k.chores.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 border-b border-divider py-2 text-sm"
            >
              <span className="flex-1">{c.label}</span>
              <button
                onClick={() => removeChore(c.id)}
                className="btn btn-ghost min-h-8 px-2 text-xs text-neutral-500"
                aria-label="Remove chore"
              >
                <i className="ph ph-trash" />
              </button>
            </div>
          ))}
          {k.chores.length === 0 && (
            <div className="text-[12px] text-neutral-600">No chores yet.</div>
          )}
        </div>
      ))}
    </div>
  );
}

function MusicEditor({ devices }: { devices: DeviceRow[] }) {
  const [music, setMusic] = useState<MusicState | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/controller/music");
    if (res.ok) setMusic(await res.json());
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, [load]);

  async function act(body: MusicActionRequest) {
    const res = await fetch("/api/controller/music", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) setMusic(await res.json());
  }

  if (!music) {
    return <div className="text-sm text-neutral-500">Loading music…</div>;
  }

  return (
    <div>
      <div className="card mb-4 p-4 text-center">
        <div className="font-heading text-lg font-medium">{music.track.title}</div>
        <div className="text-xs text-neutral-500">{music.track.artist}</div>
        <div className="mt-3 flex justify-center gap-2">
          <button
            onClick={() => act({ action: "prev" })}
            className="btn btn-secondary min-h-10 px-3"
            aria-label="Previous"
          >
            <i className="ph ph-skip-back" />
          </button>
          <button
            onClick={() => act({ action: music.isPlaying ? "pause" : "play" })}
            className="btn btn-primary min-h-10 px-5"
          >
            <i className={`ph ${music.isPlaying ? "ph-pause" : "ph-play"}`} />
            {music.isPlaying ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => act({ action: "next" })}
            className="btn btn-secondary min-h-10 px-3"
            aria-label="Next"
          >
            <i className="ph ph-skip-forward" />
          </button>
        </div>
      </div>
      <div className="uplabel mb-2">Rooms</div>
      <div className="flex flex-col gap-1.5">
        {(music.availableRooms.length
          ? music.availableRooms
          : devices.map((d) => ({ id: d.id, displayName: d.displayName }))
        ).map((r) => {
          const on = music.rooms.includes(r.id);
          return (
            <button
              key={r.id}
              onClick={() => act({ action: "toggleRoom", deviceId: r.id })}
              className="hi-tinted card flex items-center gap-3 p-3 text-left"
              style={identStyle(r.displayName)}
            >
              <i
                className={`ph ${on ? "ph-speaker-high" : "ph-speaker-slash"}`}
                style={{ color: "var(--hi-ident)" }}
              />
              <span className="flex-1 text-sm">{r.displayName}</span>
              <span className="text-[11px] text-neutral-500">
                {on ? "On" : "Off"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
