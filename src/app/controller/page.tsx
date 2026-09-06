"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTalk } from "@/lib/client/useTalk";
import { useSpeechInput } from "@/lib/client/useSpeechInput";
import Toggle from "@/components/Toggle";
import DevicesManager from "./DevicesManager";

interface DeviceRow {
  id: string;
  displayName: string;
  room: string | null;
  type: "ENDPOINT" | "CONTROLLER";
  online: boolean;
}
interface ZoneRow {
  id: string;
  name: string;
  deviceCount: number;
  onlineCount: number;
}
interface ReminderRow {
  id: string;
  text: string;
  cron: string | null;
  runAt: string | null;
  enabled: boolean;
  nextRunAt: string | null;
}

type Tab = "home" | "broadcast" | "reminders";

const roomIcon = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes("kitchen")) return "ph-cooking-pot";
  if (n.includes("rumpus")) return "ph-game-controller";
  if (n.includes("lounge")) return "ph-armchair";
  return "ph-door";
};

export default function ControllerPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ name: string } | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [pageTarget, setPageTarget] = useState<DeviceRow | null>(null);
  const [showDevices, setShowDevices] = useState(false);

  const load = useCallback(async () => {
    const [dRes, zRes] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/zones"),
    ]);
    if (dRes.status === 401 || zRes.status === 401) {
      router.replace("/login");
      return;
    }
    const d = await dRes.json();
    const z = await zRes.json();
    setDevices((d.devices ?? []).filter((x: DeviceRow) => x.type === "ENDPOINT"));
    setZones(z.zones ?? []);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) return router.replace("/login");
      const data = await res.json();
      if (!cancelled) setMe(data.user);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!me) return;
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [me, load]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
  }, [router]);

  const onlineCount = devices.filter((d) => d.online).length;

  if (showDevices) {
    return <DevicesManager onBack={() => setShowDevices(false)} />;
  }

  if (pageTarget) {
    return (
      <PageTalk target={pageTarget} onBack={() => setPageTarget(null)} />
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <main className="flex-1 overflow-auto p-5 pb-24">
        {tab === "home" && (
          <>
            <header className="mb-5 flex items-end justify-between">
              <div>
                <h1 className="m-0 text-2xl">Home</h1>
                <div className="mt-0.5 text-xs text-neutral-500">
                  {onlineCount} of {devices.length} endpoints online
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDevices(true)}
                  className="btn btn-secondary min-h-9 px-2.5 text-xs"
                  aria-label="Manage devices"
                >
                  <i className="ph ph-devices" />
                </button>
                <button onClick={signOut} className="btn btn-secondary min-h-9 text-xs">
                  <i className="ph ph-sign-out" />
                  {me?.name ?? "Sign out"}
                </button>
              </div>
            </header>

            <div className="uplabel mb-2">Zones</div>
            <div className="mb-6 flex gap-2">
              {zones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => setTab("broadcast")}
                  className="card card-hover flex-1 p-3 text-left"
                >
                  <div className="font-heading text-[15px] font-medium">{z.name}</div>
                  <div className="text-[11px] text-neutral-500">
                    {z.deviceCount} {z.deviceCount === 1 ? "room" : "rooms"}
                  </div>
                </button>
              ))}
              {zones.length === 0 && (
                <div className="text-sm text-neutral-600">No zones yet.</div>
              )}
            </div>

            <div className="uplabel mb-2">Around the house</div>
            <div className="flex flex-col gap-1.5">
              {devices.map((d) => (
                <button
                  key={d.id}
                  disabled={!d.online}
                  onClick={() => setPageTarget(d)}
                  className="card card-hover flex items-center gap-3 p-3 disabled:cursor-default disabled:opacity-55"
                >
                  <i className={`ph ${roomIcon(d.displayName)} text-lg text-accent`} />
                  <span className="flex-1 text-left font-heading text-[15px] font-medium">
                    {d.displayName}
                  </span>
                  <span className={`dot ${d.online ? "dot-online" : "dot-offline"}`} />
                  <span className="text-[11px] text-neutral-500">
                    {d.online ? "Online" : "Offline"}
                  </span>
                  <i className="ph ph-caret-right text-neutral-600" />
                </button>
              ))}
              {devices.length === 0 && (
                <div className="text-sm text-neutral-600">
                  No endpoints paired yet.
                </div>
              )}
            </div>
          </>
        )}

        {tab === "broadcast" && <Broadcast zones={zones} />}
        {tab === "reminders" && <Reminders zones={zones} devices={devices} />}
      </main>

      <TabBar tab={tab} setTab={setTab} />
    </div>
  );
}

/* ── bottom tab bar ────────────────────────────────────────────────────────*/
function TabBar({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md items-center border-t border-divider bg-bg px-6 pb-6 pt-2">
      <button
        onClick={() => setTab("home")}
        className={`flex flex-1 flex-col items-center gap-1 ${tab === "home" ? "text-accent" : "text-neutral-500"}`}
      >
        <i className="ph-fill ph-house text-xl" />
        <span className="text-[10px]">Home</span>
      </button>
      <div className="flex flex-1 justify-center">
        <button
          onClick={() => setTab("broadcast")}
          className="-mt-4 grid h-14 w-14 place-items-center rounded-full border border-accent bg-bg text-accent transition hover:bg-accent-900"
          aria-label="Broadcast"
        >
          <i className="ph-fill ph-megaphone-simple text-2xl" />
        </button>
      </div>
      <button
        onClick={() => setTab("reminders")}
        className={`flex flex-1 flex-col items-center gap-1 ${tab === "reminders" ? "text-accent" : "text-neutral-500"}`}
      >
        <i className="ph-fill ph-bell-simple text-xl" />
        <span className="text-[10px]">Reminders</span>
      </button>
    </nav>
  );
}

/* ── hold-to-talk page ─────────────────────────────────────────────────────*/
function PageTalk({ target, onBack }: { target: DeviceRow; onBack: () => void }) {
  const { status, message, start, stop } = useTalk();
  const [chime, setChime] = useState(true);
  const [inCall, setInCall] = useState(false);
  const live = status === "live";

  const toggleCall = async () => {
    if (inCall) {
      await stop();
      setInCall(false);
    } else {
      setInCall(true);
      await start({ kind: "call", deviceId: target.id });
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-5">
      <header className="flex items-center gap-3">
        <button onClick={onBack} className="btn btn-ghost min-h-9 px-2">
          <i className="ph ph-caret-left text-lg" />
        </button>
        <div className="flex-1">
          <div className="font-heading text-lg font-medium">{target.displayName}</div>
          <div className="text-xs text-neutral-500">
            {target.online ? "Online" : "Offline"}
          </div>
        </div>
        <button
          onClick={toggleCall}
          disabled={!target.online}
          className={`btn min-h-9 ${inCall ? "btn-outline" : "btn-secondary"}`}
        >
          <i className={`ph ${inCall ? "ph-phone-x" : "ph-phone"}`} />
          {inCall ? "End" : "Call"}
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        {live ? (
          <div className="flex flex-col items-center gap-3">
            <span className="tag tag-accent uppercase tracking-wider">
              {inCall ? "On call" : "On air"}
            </span>
            <div className="levels h-10">
              {[0.62, 0.48, 0.72, 0.54, 0.66].map((d, i) => (
                <span key={i} style={{ height: 40, animationDuration: `${d}s` }} />
              ))}
            </div>
            <div className="text-sm text-neutral-400">
              {inCall ? "Two-way — you can both talk" : "They can hear you"}
            </div>
          </div>
        ) : (
          <p className="max-w-[250px] text-center text-sm text-neutral-400">
            {status === "error"
              ? message
              : "A chime plays first, then your voice opens on their speaker."}
          </p>
        )}

        {inCall ? (
          <button
            onClick={toggleCall}
            className="ptt"
            data-live={live}
          >
            <i className="ph-fill ph-phone-x text-5xl" />
            <span className="font-heading text-sm font-medium">End call</span>
          </button>
        ) : (
          <div
            className="ptt"
            data-live={live}
            onPointerDown={() => start({ kind: "page", deviceId: target.id })}
            onPointerUp={stop}
            onPointerLeave={() => live && stop()}
          >
            <i className="ph-fill ph-microphone text-5xl" />
            <span className="font-heading text-sm font-medium">
              {live ? "Talking" : "Hold to talk"}
            </span>
          </div>
        )}
        <div className="text-xs text-neutral-600">
          {inCall ? "Tap to hang up" : "Release to close the channel"}
        </div>
      </div>

      <div className="card flex items-center justify-between p-3">
        <div>
          <div className="font-heading text-[13px] font-medium">Chime before I speak</div>
          <div className="text-[11px] text-neutral-500">
            Warns the room the mic is opening
          </div>
        </div>
        <Toggle on={chime} onChange={setChime} label="Chime before speaking" />
      </div>
    </div>
  );
}

/* ── broadcast ─────────────────────────────────────────────────────────────*/
function Broadcast({ zones }: { zones: ZoneRow[] }) {
  const { status, message, start, stop } = useTalk();
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [mode, setMode] = useState<"say" | "live">("say");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string>("");
  const selected = useMemo(
    () => zones.find((z) => z.id === zoneId) ?? null,
    [zones, zoneId],
  );
  const live = status === "live";

  useEffect(() => {
    if (!zoneId && zones.length) setZoneId(zones[zones.length - 1].id);
  }, [zones, zoneId]);

  async function announce() {
    if (!zoneId || !text.trim()) return;
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/announce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim(), targetZoneId: zoneId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult("Couldn't send that.");
        return;
      }
      const reached = (data.reached ?? []).length;
      const missed = (data.notConnected ?? []).length + (data.offline ?? []).length;
      setResult(
        reached > 0
          ? `Spoken on ${reached} ${reached === 1 ? "speaker" : "speakers"}` +
              (missed ? ` · ${missed} not reached` : "")
          : "No speakers reached — none connected.",
      );
      setText("");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="mb-4">
        <h1 className="m-0 text-2xl">Broadcast</h1>
        <div className="text-xs text-neutral-500">One way, every speaker at once</div>
      </header>

      <div className="mb-4 flex gap-1.5">
        {(
          [
            ["say", "ph-chat-text", "Say something"],
            ["live", "ph-microphone", "Talk live"],
          ] as ["say" | "live", string, string][]
        ).map(([m, icon, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
              mode === m ? "bg-accent text-[#141221]" : "card text-neutral-300"
            }`}
          >
            <i className={`ph ${icon}`} />
            {label}
          </button>
        ))}
      </div>

      <div className="uplabel mb-2">Send to</div>
      <div className="mb-4 flex flex-col gap-1.5">
        {zones.map((z) => {
          const on = z.id === zoneId;
          return (
            <button
              key={z.id}
              onClick={() => setZoneId(z.id)}
              className={`card flex items-center justify-between p-3 text-left ${on ? "ring-1 ring-accent" : "card-hover"}`}
            >
              <div>
                <div className="font-heading text-[15px] font-medium">{z.name}</div>
                <div className="text-[11px] text-neutral-500">
                  {z.deviceCount} endpoints · {z.onlineCount} online
                </div>
              </div>
              <i
                className={`ph-fill ph-check-circle text-xl ${on ? "text-accent" : "text-neutral-700"}`}
              />
            </button>
          );
        })}
      </div>

      {mode === "say" ? (
        <>
          <textarea
            className="input mb-3 min-h-24"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dinner's ready — wash your hands, please."
          />
          <button
            onClick={announce}
            disabled={sending || !text.trim() || !zoneId}
            className="btn btn-primary min-h-12 w-full"
          >
            <i className="ph-fill ph-megaphone-simple text-lg" />
            {sending ? "Sending…" : `Announce to ${selected?.name ?? "…"}`}
          </button>
          {result && (
            <p className="mt-3 text-center text-sm text-neutral-400">{result}</p>
          )}
          <p className="mt-3 text-center text-[11px] text-neutral-600">
            Spoken aloud on every connected speaker. No waiting to connect.
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-5 py-6">
          {live && (
            <div className="flex flex-col items-center gap-2">
              <span className="tag tag-accent uppercase tracking-wider">
                Live to {selected?.name}
              </span>
              <div className="text-sm text-neutral-400">
                {selected?.onlineCount} speakers open
              </div>
            </div>
          )}
          {status === "error" && <p className="text-sm text-accent-200">{message}</p>}
          <div
            className="ptt"
            data-live={live}
            onPointerDown={() => zoneId && start({ kind: "broadcast", zoneId })}
            onPointerUp={stop}
            onPointerLeave={() => live && stop()}
          >
            <i className="ph-fill ph-megaphone-simple text-5xl" />
            <span className="font-heading text-sm font-medium">
              {live ? "Broadcasting" : "Hold to talk"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/* ── reminders ─────────────────────────────────────────────────────────────*/
function Reminders({
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

/* ── AI reminder box ───────────────────────────────────────────────────────*/
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

function reminderTime(r: ReminderRow): string {
  if (r.runAt) {
    return new Date(r.runAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  // Cron "m h * * *" → show HH:MM when possible.
  if (r.cron) {
    const parts = r.cron.split(" ");
    if (parts.length >= 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      return `${parts[1].padStart(2, "0")}:${parts[0].padStart(2, "0")}`;
    }
  }
  return "—";
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
  const [target, setTarget] = useState<{ zoneId?: string; deviceId?: string }>(
    {},
  );
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
