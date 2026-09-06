"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack, Track } from "livekit-client";
import {
  getDeviceSecret,
  getDeviceId,
  saveDeviceCredentials,
  clearDeviceCredentials,
} from "@/lib/client/identity";
import { decodeCommand } from "@/lib/control/commands";
import { speak, reminderTime } from "@/lib/client/speak";
import Toggle from "@/components/Toggle";

type Phase = "loading" | "unpaired" | "ready" | "error";
type Rail = "home" | "schedule" | "jobs" | "reminders" | "sound";

interface Incoming {
  title: string;
  mode: string;
}

interface EndpointReminder {
  id: string;
  text: string;
  sound: string | null;
  cron: string | null;
  runAt: string | null;
  nextRunAt: string | null;
}

interface JobChore {
  id: string;
  label: string;
  done: boolean;
}
interface JobKid {
  id: string;
  name: string;
  initial: string;
  total: number;
  doneToday: number;
  streak: number;
  chores: JobChore[];
}
interface JobBoard {
  weekDoneTotal: number;
  kids: JobKid[];
}

export default function EndpointPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rail, setRail] = useState<Rail>("home");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState("This room");
  const [dnd, setDnd] = useState(false);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [reminders, setReminders] = useState<EndpointReminder[]>([]);
  const [speaking, setSpeaking] = useState<EndpointReminder | null>(null);
  const [board, setBoard] = useState<JobBoard | null>(null);

  const lobbyRef = useRef<Room | null>(null);
  const mediaRef = useRef<Room | null>(null);
  const sinkRef = useRef<HTMLDivElement | null>(null);

  // Live clock.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 20);
    return () => clearInterval(t);
  }, []);

  const leaveMedia = useCallback(async () => {
    const r = mediaRef.current;
    mediaRef.current = null;
    setIncoming(null);
    if (r) await r.disconnect().catch(() => {});
  }, []);

  const joinMedia = useCallback(
    async (url: string, token: string, mode: string, title: string) => {
      await leaveMedia();
      const r = new Room();
      mediaRef.current = r;
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio && sinkRef.current) {
          const el = track.attach();
          el.autoplay = true;
          sinkRef.current.appendChild(el);
        }
      });
      r.on(RoomEvent.Disconnected, () => {
        if (mediaRef.current === r) leaveMedia();
      });
      await r.connect(url, token);
      if (mode === "duplex") await r.localParticipant.setMicrophoneEnabled(true);
      setIncoming({ title, mode });
    },
    [leaveMedia],
  );

  const heartbeat = useCallback(async () => {
    const secret = getDeviceSecret();
    if (!secret) {
      setPhase("unpaired");
      return;
    }
    try {
      const res = await fetch("/api/presence", {
        method: "POST",
        headers: { "x-device-secret": secret },
      });
      if (res.status === 401) {
        clearDeviceCredentials();
        setPhase("unpaired");
        return;
      }
      const data = await res.json();
      setDnd(!!data.doNotDisturb);
      setPhase("ready");

      // Real mode: keep a lobby connection for control messages.
      if (!data.mock && !lobbyRef.current) {
        const r = new Room();
        lobbyRef.current = r;
        r.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const cmd = decodeCommand(payload);
            if (cmd.type === "join") {
              joinMedia(data.livekitUrl, cmd.token, cmd.mode, "Incoming");
            } else if (cmd.type === "hangup") {
              leaveMedia();
            }
          } catch {
            /* ignore malformed control message */
          }
        });
        await r.connect(data.livekitUrl, data.lobbyToken);
      }
    } catch (e) {
      setPhase("error");
      setNote(e instanceof Error ? e.message : "Connection failed");
    }
  }, [joinMedia, leaveMedia]);

  useEffect(() => {
    heartbeat();
    const t = setInterval(heartbeat, 10_000);
    return () => clearInterval(t);
  }, [heartbeat]);

  // Load this panel's reminders once paired, and refresh periodically.
  const loadReminders = useCallback(async () => {
    const secret = getDeviceSecret();
    if (!secret) return;
    const res = await fetch("/api/endpoint/reminders", {
      headers: { "x-device-secret": secret },
    });
    if (res.ok) setReminders((await res.json()).reminders ?? []);
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    loadReminders();
    const t = setInterval(loadReminders, 60_000);
    return () => clearInterval(t);
  }, [phase, loadReminders]);

  // Jobs board.
  const loadJobs = useCallback(async () => {
    const secret = getDeviceSecret();
    if (!secret) return;
    const res = await fetch("/api/jobs", { headers: { "x-device-secret": secret } });
    if (res.ok) setBoard(await res.json());
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    loadJobs();
    const t = setInterval(loadJobs, 30_000);
    return () => clearInterval(t);
  }, [phase, loadJobs]);

  const tick = useCallback(async (choreId: string) => {
    const secret = getDeviceSecret();
    if (!secret) return;
    // Optimistic toggle.
    setBoard((b) =>
      b
        ? {
            ...b,
            kids: b.kids.map((k) => {
              const chores = k.chores.map((c) =>
                c.id === choreId ? { ...c, done: !c.done } : c,
              );
              return { ...k, chores, doneToday: chores.filter((c) => c.done).length };
            }),
          }
        : b,
    );
    await fetch("/api/jobs/tick", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-secret": secret },
      body: JSON.stringify({ choreId }),
    }).catch(() => {});
    loadJobs();
  }, [loadJobs]);

  const playReminder = useCallback((r: EndpointReminder) => {
    setSpeaking(r);
    speak(r.text);
  }, []);

  const dismissReminder = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(null);
  }, []);

  const claim = useCallback(async () => {
    setNote("");
    try {
      const res = await fetch("/api/devices/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNote(typeof data.error === "string" ? data.error : "Pairing failed");
        return;
      }
      saveDeviceCredentials(data.device.id, data.device.deviceSecret);
      setRoom(data.device.room ?? data.device.displayName ?? "This room");
      setPhase("loading");
      heartbeat();
    } catch {
      setNote("Pairing failed");
    }
  }, [code, heartbeat]);

  const clockBig = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateLong = now.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (phase === "unpaired") {
    return (
      <main className="kiosk grid min-h-screen place-items-center p-6">
        <div className="flex w-full max-w-xs flex-col gap-4 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-900 text-accent">
            <i className="ph-fill ph-speaker-high text-3xl" />
          </span>
          <h1 className="m-0 text-2xl">Pair this device</h1>
          <p className="text-sm text-neutral-400">
            Enter the 6-character code from the Controller app.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            className="input text-center text-2xl tracking-[0.4em]"
            placeholder="ABC234"
          />
          <button onClick={claim} className="btn btn-primary min-h-12">
            Pair
          </button>
          {note && <p className="text-sm text-accent-200">{note}</p>}
        </div>
      </main>
    );
  }

  return (
    <div className="kiosk relative flex h-screen">
      {/* rail */}
      <nav className="flex w-56 flex-none flex-col gap-1.5 border-r border-divider p-5">
        <div className="px-2 pb-4">
          <div className="font-heading text-lg font-medium">{room}</div>
          <div className="text-[11px] text-neutral-500">Home intercom</div>
        </div>
        {(
          [
            ["home", "ph-house", "Home"],
            ["schedule", "ph-calendar-dots", "Schedule"],
            ["jobs", "ph-list-checks", "Jobs"],
            ["reminders", "ph-bell-simple", "Reminders"],
            ["sound", "ph-speaker-high", "Sound"],
          ] as [Rail, string, string][]
        ).map(([key, icon, label]) => (
          <button
            key={key}
            onClick={() => setRail(key)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[15px] transition ${
              rail === key
                ? "bg-accent-900 text-accent-200"
                : "text-neutral-300 hover:bg-surface"
            }`}
          >
            <i className={`ph ${icon} text-xl`} />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${dnd ? "bg-accent-900 text-accent-200" : "text-neutral-500"}`}
        >
          <i className="ph ph-moon text-base" />
          {dnd ? "Do not disturb" : "Available"}
        </div>
      </nav>

      {/* main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-none items-center gap-3 px-7 pb-3 pt-5">
          <div className="flex-1 text-sm text-neutral-400">
            {phase === "ready" ? "Connected" : "Connecting…"}
          </div>
          <div className="font-heading text-lg font-medium">{clockBig}</div>
        </div>

        {rail === "home" && (
          <div className="flex flex-1 flex-col justify-center px-7 pb-8">
            <div className="font-heading text-[120px] font-medium leading-none tracking-tight">
              {clockBig}
            </div>
            <div className="mt-3 text-xl text-neutral-400">{dateLong}</div>
            <div className="mt-9 flex gap-3">
              <InfoCard
                label="Status"
                value={dnd ? "Do not disturb" : "Listening"}
                sub={phase === "ready" ? "Online" : "Reconnecting"}
              />
              {reminders[0] ? (
                <button
                  onClick={() => setRail("reminders")}
                  className="card card-hover flex-1 p-4 text-left"
                >
                  <div className="uplabel mb-1.5 text-accent">
                    Next reminder · {reminderTime(reminders[0])}
                  </div>
                  <div className="font-heading text-lg font-medium leading-snug">
                    {reminders[0].text}
                  </div>
                </button>
              ) : (
                <InfoCard label="Household" value={room} sub="This wall panel" />
              )}
            </div>
          </div>
        )}

        {rail === "reminders" && (
          <div className="flex flex-1 flex-col overflow-hidden px-7 pb-8">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h3 className="m-0">Reminders</h3>
                <div className="text-xs text-neutral-500">
                  Spoken here on schedule · edit them on a parent&apos;s phone
                </div>
              </div>
              <span className="tag tag-outline whitespace-nowrap">{room} only</span>
            </div>
            <div className="no-scrollbar flex-1 overflow-auto">
              {reminders.length === 0 && (
                <div className="py-16 text-center text-neutral-500">
                  <i className="ph ph-bell-simple mb-2 block text-3xl text-accent-400" />
                  <div className="text-sm">Nothing scheduled for this room.</div>
                </div>
              )}
              {reminders.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-4 border-b border-divider py-3.5"
                >
                  <div className="w-20 flex-none font-heading text-lg font-medium text-accent-300">
                    {reminderTime(r)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px]">{r.text}</div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {r.cron ? "Repeats daily" : "Once"}
                    </div>
                  </div>
                  <button
                    onClick={() => playReminder(r)}
                    className="btn btn-secondary min-h-11"
                  >
                    <i className="ph ph-play text-[15px]" />
                    Play now
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {rail === "schedule" && (
          <ComingSoon
            icon="ph-calendar-dots"
            title="Today's schedule"
            body="The shared calendar surface lands in the smart-display phase."
          />
        )}
        {rail === "jobs" && (
          <div className="flex flex-1 flex-col overflow-hidden px-7 pb-6">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h3 className="m-0">Jobs</h3>
                <div className="text-xs text-neutral-500">
                  Tap a job when it&apos;s done · resets each week
                </div>
              </div>
              <div className="text-right">
                <div className="font-heading text-2xl font-medium">
                  {board?.weekDoneTotal ?? 0}
                </div>
                <div className="text-[11px] text-neutral-500">done this week</div>
              </div>
            </div>
            <div className="grid flex-1 grid-cols-4 gap-3 overflow-hidden">
              {(board?.kids ?? []).map((k) => {
                const pct = k.total ? Math.round((k.doneToday / k.total) * 100) : 0;
                return (
                  <div key={k.id} className="card flex min-h-0 flex-col gap-2.5 p-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-accent-900 font-heading text-base font-medium text-accent-200">
                        {k.initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-heading text-[17px] font-medium">
                          {k.name}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-accent-300">
                          <i className="ph-fill ph-flame text-xs" />
                          {k.streak > 0 ? `${k.streak}-day streak` : "No streak yet"}
                        </div>
                      </div>
                    </div>
                    <div className="h-1 overflow-hidden rounded bg-neutral-800">
                      <div
                        className="h-full rounded bg-accent transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {k.doneToday} of {k.total} today
                    </div>
                    <div className="no-scrollbar flex flex-col gap-1.5 overflow-auto">
                      {k.chores.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => tick(c.id)}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                            c.done ? "bg-accent-900/60" : "hover:bg-neutral-800"
                          }`}
                        >
                          <span
                            className={`grid h-5 w-5 flex-none place-items-center rounded-md border ${
                              c.done
                                ? "border-accent bg-accent text-[#141221]"
                                : "border-neutral-600"
                            }`}
                          >
                            {c.done && <i className="ph-bold ph-check text-[11px]" />}
                          </span>
                          <span
                            className={
                              c.done ? "text-neutral-500 line-through" : "text-neutral-200"
                            }
                          >
                            {c.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {(!board || board.kids.length === 0) && (
                <div className="col-span-4 grid place-items-center text-neutral-500">
                  No kids set up yet.
                </div>
              )}
            </div>
          </div>
        )}

        {rail === "sound" && (
          <div className="flex-1 overflow-auto px-7 pb-8">
            <h3 className="mb-1 mt-1">Sound</h3>
            <p className="mb-5 text-xs text-neutral-500">
              This panel only. Other rooms keep their own settings.
            </p>
            <div className="card mb-3 flex items-center gap-4 p-4">
              <i className="ph ph-moon text-2xl text-accent" />
              <div className="flex-1">
                <div className="font-heading text-lg font-medium">Do not disturb</div>
                <div className="text-[13px] text-neutral-500">
                  Pages still ring; reminders wait.
                </div>
              </div>
              <Toggle on={dnd} onChange={setDnd} label="Do not disturb" />
            </div>
            <p className="text-[11px] text-neutral-600">
              Volume and chime controls arrive with kiosk hardening (Phase 5).
            </p>
          </div>
        )}
      </div>

      {/* incoming page/call overlay */}
      {incoming && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-7 p-10"
          style={{
            background:
              "linear-gradient(160deg, var(--color-accent-900), var(--color-bg) 62%)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="dot dot-online animate-breathe" />
            <span className="text-xs uppercase tracking-[0.16em] text-accent-200">
              On air · {room}
            </span>
          </div>
          <div className="text-center font-heading text-5xl font-medium">
            {incoming.title}
          </div>
          <div className="levels h-14">
            {[0.62, 0.48, 0.74, 0.55, 0.68].map((d, i) => (
              <span key={i} style={{ width: 7, height: 54, animationDuration: `${d}s` }} />
            ))}
          </div>
          <button onClick={leaveMedia} className="btn btn-secondary min-h-14 px-7 text-base">
            <i className="ph ph-x text-lg" />
            Dismiss
          </button>
        </div>
      )}

      {/* reminder speaking overlay */}
      {speaking && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 p-14 text-center"
          style={{
            background:
              "linear-gradient(160deg, var(--color-neutral-900), var(--color-bg) 60%)",
          }}
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-accent">
            <i className="ph-fill ph-bell-ringing text-lg" />
            Reminder · {room}
          </div>
          <div className="max-w-3xl font-heading text-5xl font-medium leading-tight">
            {speaking.text}
          </div>
          <div className="mt-2 flex gap-3.5">
            <button onClick={dismissReminder} className="btn btn-outline min-h-14 px-8 text-base">
              <i className="ph ph-check text-lg" />
              Got it
            </button>
            <button
              onClick={() => speak(speaking.text)}
              className="btn btn-secondary min-h-14 px-7 text-base"
            >
              <i className="ph ph-repeat text-lg" />
              Again
            </button>
          </div>
        </div>
      )}

      <div ref={sinkRef} hidden />
      {note && phase === "error" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-accent-200">
          {note}
        </div>
      )}
    </div>
  );
}

function InfoCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="card flex-1 p-4">
      <div className="uplabel mb-1.5 text-accent">{label}</div>
      <div className="font-heading text-lg font-medium">{value}</div>
      <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>
    </div>
  );
}

function ComingSoon({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
      <i className={`ph ${icon} text-4xl text-accent-400`} />
      <div className="font-heading text-xl font-medium">{title}</div>
      <p className="max-w-md text-sm text-neutral-500">{body}</p>
    </div>
  );
}
