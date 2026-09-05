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
import Toggle from "@/components/Toggle";

type Phase = "loading" | "unpaired" | "ready" | "error";
type Rail = "home" | "schedule" | "jobs" | "reminders" | "sound";

interface Incoming {
  title: string;
  mode: string;
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
              <InfoCard label="Household" value={room} sub="This wall panel" />
              <InfoCard
                label="Status"
                value={dnd ? "Do not disturb" : "Listening"}
                sub={phase === "ready" ? "Online" : "Reconnecting"}
              />
            </div>
          </div>
        )}

        {rail === "reminders" && (
          <ComingSoon
            icon="ph-bell-simple"
            title="Reminders speak here on schedule"
            body="This panel plays scheduled reminders aloud. The list view is wiring up next — parents already create and manage reminders from the Controller."
          />
        )}
        {rail === "schedule" && (
          <ComingSoon
            icon="ph-calendar-dots"
            title="Today's schedule"
            body="The shared calendar surface lands in the smart-display phase."
          />
        )}
        {rail === "jobs" && (
          <ComingSoon
            icon="ph-list-checks"
            title="Jobs & chore streaks"
            body="Tap-to-tick chore charts land in the smart-display phase."
          />
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
