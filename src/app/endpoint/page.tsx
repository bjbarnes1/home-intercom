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
import { isWellFormedPairingCode } from "@/lib/devices/pairing";
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

interface SchedEvent {
  id: string;
  title: string;
  time: string;
  who: string | null;
  color: string;
}
interface SchedDay {
  day: string;
  weekday: string;
  dayNum: number;
  count: number;
  events: SchedEvent[];
}
interface Schedule {
  days: SchedDay[];
  nextEvent: { title: string; time: string; who: string | null; day: string } | null;
}

interface MusicState {
  source: string;
  isPlaying: boolean;
  rooms: string[];
  track: { index: number; total: number; title: string; artist: string; durationSec: number };
  availableRooms: { id: string; displayName: string }[];
}

export default function EndpointPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [rail, setRail] = useState<Rail>("home");
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [room, setRoom] = useState("This room");
  const [dnd, setDnd] = useState(false);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [ringing, setRinging] = useState<{
    url: string;
    token: string;
    mode: string;
    title: string;
  } | null>(null);
  const [halfDuplex, setHalfDuplex] = useState(false);
  const [quietHours, setQuietHours] = useState(false);
  const [chime, setChime] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [mock, setMock] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [reminders, setReminders] = useState<EndpointReminder[]>([]);
  const [speaking, setSpeaking] = useState<EndpointReminder | null>(null);
  const [board, setBoard] = useState<JobBoard | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [schedDay, setSchedDay] = useState(0);
  const [music, setMusic] = useState<MusicState | null>(null);
  const [musicOpen, setMusicOpen] = useState(false);

  const lobbyRef = useRef<Room | null>(null);
  const mediaRef = useRef<Room | null>(null);
  const sinkRef = useRef<HTMLDivElement | null>(null);
  const autoPairTried = useRef(false);

  // Prefill a pairing code passed via ?code= (e.g. scanned from the QR).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("code");
    if (p) setCode(p.toUpperCase());
  }, []);

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
      // When the caller/broadcaster leaves, close this end automatically.
      r.on(RoomEvent.ParticipantDisconnected, () => {
        if (mediaRef.current === r && r.remoteParticipants.size === 0) leaveMedia();
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
      setMock(!!data.mock);
      setPhase("ready");

      // Real mode: keep a lobby connection for control messages, and
      // re-establish it whenever it drops (token expiry, network blip, sleep).
      if (!data.mock && !lobbyRef.current) {
        const r = new Room();
        lobbyRef.current = r;
        r.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const cmd = decodeCommand(payload);
            if (cmd.type === "join") {
              if (cmd.autoAnswer) {
                joinMedia(data.livekitUrl, cmd.token, cmd.mode, "Incoming page");
              } else {
                // A call rings first — wait for Answer.
                setRinging({
                  url: data.livekitUrl,
                  token: cmd.token,
                  mode: cmd.mode,
                  title: "Incoming call",
                });
              }
            } else if (cmd.type === "hangup") {
              setRinging(null);
              leaveMedia();
            }
          } catch {
            /* ignore malformed control message */
          }
        });
        r.on(RoomEvent.Disconnected, () => {
          if (lobbyRef.current === r) {
            lobbyRef.current = null; // allow the next heartbeat to reconnect
            setReceiving(false);
          }
        });
        try {
          await r.connect(data.livekitUrl, data.lobbyToken);
          setReceiving(true);
        } catch (e) {
          if (lobbyRef.current === r) lobbyRef.current = null;
          setReceiving(false);
          throw e;
        }
      }
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Connection failed");
      // Don't drop the whole panel to an error screen for a transient lobby
      // hiccup — the heartbeat will retry.
      setPhase((p) => (p === "ready" ? p : "error"));
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

  // Schedule.
  const loadSchedule = useCallback(async () => {
    const secret = getDeviceSecret();
    if (!secret) return;
    const res = await fetch("/api/schedule", { headers: { "x-device-secret": secret } });
    if (res.ok) setSchedule(await res.json());
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    loadSchedule();
    const t = setInterval(loadSchedule, 120_000);
    return () => clearInterval(t);
  }, [phase, loadSchedule]);

  // Music.
  const loadMusic = useCallback(async () => {
    const secret = getDeviceSecret();
    if (!secret) return;
    const res = await fetch("/api/music", { headers: { "x-device-secret": secret } });
    if (res.ok) setMusic(await res.json());
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    loadMusic();
    const t = setInterval(loadMusic, 15_000);
    return () => clearInterval(t);
  }, [phase, loadMusic]);

  const musicAction = useCallback(
    async (action: string, extra?: Record<string, unknown>) => {
      const secret = getDeviceSecret();
      if (!secret) return;
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-secret": secret },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.ok) setMusic(await res.json());
    },
    [],
  );

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

  // Auto-submit a valid code that arrived via the URL, once.
  useEffect(() => {
    if (
      phase === "unpaired" &&
      !autoPairTried.current &&
      isWellFormedPairingCode(code)
    ) {
      autoPairTried.current = true;
      claim();
    }
  }, [phase, code, claim]);

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
          <div className="flex flex-1 items-center gap-2 text-sm text-neutral-400">
            <span
              className={`dot ${mock ? "dot-offline" : receiving ? "dot-online" : "dot-offline"}`}
            />
            {mock
              ? "Demo mode — audio disabled"
              : receiving
                ? "Ready to receive"
                : "Connecting to audio…"}
          </div>
          <button
            onClick={() => {
              setRail("home");
              setMusicOpen((v) => !v);
            }}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] transition ${
              musicOpen || music?.isPlaying
                ? "bg-accent-900 text-accent-200"
                : "text-neutral-400 hover:bg-surface"
            }`}
          >
            <i className="ph ph-music-notes text-base" />
            {music?.isPlaying ? "Playing" : "Music"}
          </button>
          <div className="font-heading text-lg font-medium">{clockBig}</div>
        </div>

        {rail === "home" && musicOpen && (
          <MusicPlayer
            music={music}
            room={room}
            onAction={musicAction}
            onClose={() => setMusicOpen(false)}
          />
        )}

        {rail === "home" && !musicOpen && (
          <div className="flex flex-1 flex-col justify-center px-7 pb-8">
            <div className="font-heading text-[120px] font-medium leading-none tracking-tight">
              {clockBig}
            </div>
            <div className="mt-3 text-xl text-neutral-400">{dateLong}</div>
            <div className="mt-9 flex gap-3">
              <button
                onClick={() => setRail("schedule")}
                className="card card-hover flex-1 p-4 text-left"
              >
                <div className="uplabel mb-1.5 text-accent">Next on the calendar</div>
                {schedule?.nextEvent ? (
                  <>
                    <div className="font-heading text-lg font-medium">
                      {schedule.nextEvent.title}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {schedule.nextEvent.time}
                      {schedule.nextEvent.who ? ` · ${schedule.nextEvent.who}` : ""}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-neutral-500">Nothing coming up</div>
                )}
              </button>
              <button
                onClick={() => setRail("jobs")}
                className="card card-hover flex-1 p-4 text-left"
              >
                <div className="uplabel mb-1.5 text-accent">Jobs still open</div>
                {(() => {
                  const open = (board?.kids ?? []).reduce(
                    (n, k) => n + (k.total - k.doneToday),
                    0,
                  );
                  return (
                    <>
                      <div className="font-heading text-lg font-medium">
                        {open === 0 ? "All done 🎉" : `${open} to go`}
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {board?.weekDoneTotal ?? 0} done this week
                      </div>
                    </>
                  );
                })()}
              </button>
              <button
                onClick={() => setRail("reminders")}
                className="card card-hover flex-1 p-4 text-left"
              >
                <div className="uplabel mb-1.5 text-accent">Next reminder</div>
                {reminders[0] ? (
                  <>
                    <div className="font-heading text-lg font-medium">
                      {reminderTime(reminders[0])}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500 line-clamp-1">
                      {reminders[0].text}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-neutral-500">None scheduled</div>
                )}
              </button>
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
          <div className="flex flex-1 flex-col overflow-hidden px-7 pb-6">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h3 className="m-0">
                  {schedule?.days[schedDay]
                    ? schedDay === 0
                      ? "Today"
                      : `${schedule.days[schedDay].weekday} ${schedule.days[schedDay].dayNum}`
                    : "Schedule"}
                </h3>
                <div className="text-xs text-neutral-500">
                  {schedule?.days[schedDay]?.count
                    ? `${schedule.days[schedDay].count} ${schedule.days[schedDay].count === 1 ? "event" : "events"}`
                    : "Nothing booked"}
                </div>
              </div>
              <div className="flex gap-1.5">
                {(schedule?.days ?? []).map((d, i) => (
                  <button
                    key={d.day}
                    onClick={() => setSchedDay(i)}
                    className={`flex w-11 flex-col items-center gap-0.5 rounded-lg py-1.5 transition ${
                      i === schedDay
                        ? "bg-accent text-[#141221]"
                        : "text-neutral-400 hover:bg-surface"
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-wide opacity-70">
                      {d.weekday}
                    </span>
                    <span className="font-heading text-[17px] font-medium">
                      {d.dayNum}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="no-scrollbar flex-1 overflow-auto">
              {schedule?.days[schedDay]?.events.length ? (
                schedule.days[schedDay].events.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-4 border-b border-divider py-3.5"
                  >
                    <div className="w-20 flex-none font-heading text-[17px] font-medium text-accent-300">
                      {e.time}
                    </div>
                    <div
                      className="h-9 w-[3px] flex-none rounded"
                      style={{ background: e.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-heading text-lg font-medium">{e.title}</div>
                      {e.who && (
                        <div className="mt-0.5 text-[13px] text-neutral-500">{e.who}</div>
                      )}
                    </div>
                    {e.who && <span className="tag tag-neutral">{e.who}</span>}
                  </div>
                ))
              ) : (
                <div className="grid place-items-center py-16 text-center text-neutral-500">
                  <div>
                    <i className="ph ph-cloud-sun mb-2 block text-3xl text-accent-400" />
                    <div className="text-[17px]">
                      Nothing booked. A rare and beautiful thing.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
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
            <div className="card mb-4 flex items-center gap-4 p-4">
              <i className="ph ph-moon text-2xl text-accent" />
              <div className="flex-1">
                <div className="font-heading text-lg font-medium">Do not disturb</div>
                <div className="text-[13px] text-neutral-500">
                  Pages still ring; reminders wait.
                </div>
              </div>
              <Toggle on={dnd} onChange={setDnd} label="Do not disturb" />
            </div>

            <div className="flex flex-col">
              <SoundRow
                title="Chime before someone speaks"
                sub="A short tone so nobody is startled"
                on={chime}
                onChange={setChime}
              />
              <SoundRow
                title="Half duplex"
                sub="One direction at a time — stops feedback in open rooms"
                on={halfDuplex}
                onChange={setHalfDuplex}
              />
              <SoundRow
                title="Quiet hours · 7:30pm to 7:00am"
                sub="Reminders whisper, pages still ring"
                on={quietHours}
                onChange={setQuietHours}
              />
            </div>
            <p className="mt-4 text-[11px] text-neutral-600">
              These apply to this panel. Per-device persistence and volume land
              with kiosk hardening (Phase 5).
            </p>
          </div>
        )}
      </div>

      {/* incoming call — ring first */}
      {ringing && !incoming && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 p-10"
          style={{
            background:
              "linear-gradient(160deg, var(--color-accent-900), var(--color-bg) 62%)",
          }}
        >
          <div className="text-xs uppercase tracking-[0.16em] text-accent-200">
            Calling {room}
          </div>
          <div
            className="grid h-28 w-28 place-items-center rounded-full bg-surface"
            style={{ animation: "halo 1.6s ease-out infinite" }}
          >
            <i className="ph-fill ph-phone text-4xl text-accent" />
          </div>
          <div className="font-heading text-4xl font-medium">{ringing.title}</div>
          <div className="text-sm text-neutral-400">Two-way — they&apos;ll hear the room</div>
          <div className="mt-2 flex gap-4">
            <button
              onClick={() => {
                joinMedia(ringing.url, ringing.token, ringing.mode, "In call");
                setRinging(null);
              }}
              className="btn btn-outline min-h-16 px-9 text-lg"
            >
              <i className="ph-fill ph-phone text-xl" />
              Answer
            </button>
            <button
              onClick={() => setRinging(null)}
              className="btn btn-secondary min-h-16 px-7 text-lg"
            >
              <i className="ph ph-phone-x text-xl" />
              Not now
            </button>
          </div>
        </div>
      )}

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

function SoundRow({
  title,
  sub,
  on,
  onChange,
}: {
  title: string;
  sub: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-divider py-3.5 last:border-0">
      <div className="flex-1">
        <div className="text-base">{title}</div>
        <div className="text-xs text-neutral-500">{sub}</div>
      </div>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}

function MusicPlayer({
  music,
  room,
  onAction,
  onClose,
}: {
  music: MusicState | null;
  room: string;
  onAction: (action: string, extra?: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  if (!music) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-500">
        Loading…
      </div>
    );
  }
  const otherSource = music.source === "Household" ? "Spotify" : "Household";
  return (
    <div className="flex flex-1 items-center gap-7 px-7 pb-8">
      <div
        className="grid h-60 w-60 flex-none place-items-center rounded-xl"
        style={{
          background: "linear-gradient(150deg, var(--color-accent-800), var(--color-neutral-900))",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <i className="ph ph-vinyl-record text-7xl text-accent-300 opacity-75" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="tag tag-neutral">{music.source}</span>
          <button onClick={onClose} className="ml-auto btn btn-ghost min-h-8 text-xs">
            <i className="ph ph-x" />
            Close
          </button>
        </div>
        <div className="font-heading text-4xl font-medium leading-tight">
          {music.track.title}
        </div>
        <div className="mt-1 text-lg text-neutral-400">{music.track.artist}</div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => onAction("prev")}
            className="grid h-14 w-14 place-items-center rounded-full bg-surface hover:bg-neutral-800"
          >
            <i className="ph-fill ph-skip-back text-lg" />
          </button>
          <button
            onClick={() => onAction(music.isPlaying ? "pause" : "play")}
            className="grid h-16 w-16 place-items-center rounded-full border border-accent text-accent hover:bg-accent-900"
          >
            <i className={`ph-fill ${music.isPlaying ? "ph-pause" : "ph-play"} text-2xl`} />
          </button>
          <button
            onClick={() => onAction("next")}
            className="grid h-14 w-14 place-items-center rounded-full bg-surface hover:bg-neutral-800"
          >
            <i className="ph-fill ph-skip-forward text-lg" />
          </button>
          <div className="mx-2 h-10 w-px bg-divider" />
          <button
            onClick={() => onAction("source", { source: otherSource })}
            className="btn btn-secondary"
          >
            <i className="ph ph-shuffle-angular" />
            Switch to {otherSource}
          </button>
        </div>

        <div className="mt-6">
          <div className="uplabel mb-2">Playing in</div>
          <div className="flex flex-wrap gap-2">
            {music.availableRooms.map((r) => {
              const on = music.rooms.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => onAction("toggleRoom", { deviceId: r.id })}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
                    on
                      ? "bg-accent text-[#141221]"
                      : "border border-divider text-neutral-300 hover:border-accent"
                  }`}
                >
                  <i className="ph ph-speaker-high text-base" />
                  {r.displayName}
                  {r.displayName === room && " (here)"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
