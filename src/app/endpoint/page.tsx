"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDeviceSecret,
  saveDeviceCredentials,
} from "@/lib/client/identity";
import { speak } from "@/lib/client/speak";
import { isWellFormedPairingCode } from "@/lib/devices/pairing";
import type { MusicActionRequest } from "@/lib/music/actions";
import type {
  EndpointReminder,
  JobBoard,
  MusicState,
  Rail,
  Schedule,
} from "./types";
import { useMediaSession } from "./useMediaSession";
import { useEndpointPresence } from "./useEndpointPresence";
import { useDevicePolledJson } from "@/lib/client/usePolledJson";
import PairingScreen from "./PairingScreen";
import MusicPlayer from "./MusicPlayer";
import HomeRail from "./rails/HomeRail";
import ScheduleRail from "./rails/ScheduleRail";
import JobsRail from "./rails/JobsRail";
import RemindersRail from "./rails/RemindersRail";
import SoundRail from "./rails/SoundRail";
import RingOverlay from "./overlays/RingOverlay";
import IncomingOverlay from "./overlays/IncomingOverlay";
import SpeakingOverlay from "./overlays/SpeakingOverlay";

const RAIL_ITEMS: [Rail, string, string][] = [
  ["home", "ph-house", "Home"],
  ["schedule", "ph-calendar-dots", "Schedule"],
  ["jobs", "ph-list-checks", "Jobs"],
  ["reminders", "ph-bell-simple", "Reminders"],
  ["sound", "ph-speaker-high", "Sound"],
];

const selectReminders = (json: unknown) =>
  ((json as { reminders?: EndpointReminder[] }).reminders ?? []) as EndpointReminder[];
const selectBoard = (json: unknown) => json as JobBoard;
const selectSchedule = (json: unknown) => json as Schedule;
const selectMusic = (json: unknown) => json as MusicState;

export default function EndpointPage() {
  const media = useMediaSession();
  const {
    phase,
    setPhase,
    note,
    setNote,
    room,
    setRoom,
    dnd,
    setDoNotDisturb,
    receiving,
    receiveError,
    livekitUrl,
    mock,
    speaking,
    setSpeaking,
    dismissSpeaking,
    heartbeat,
  } = useEndpointPresence(media);
  const [rail, setRail] = useState<Rail>("home");
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [schedDay, setSchedDay] = useState(0);
  const [musicOpen, setMusicOpen] = useState(false);
  const [boardOverride, setBoardOverride] = useState<JobBoard | null>(null);
  const autoPairTried = useRef(false);

  const ready = phase === "ready";

  const { data: reminders } = useDevicePolledJson(
    ready,
    "/api/endpoint/reminders",
    60_000,
    selectReminders,
  );
  const { data: polledBoard, reload: reloadJobs } = useDevicePolledJson(
    ready,
    "/api/jobs",
    30_000,
    selectBoard,
  );
  const { data: schedule } = useDevicePolledJson(
    ready,
    "/api/schedule",
    120_000,
    selectSchedule,
  );
  const { data: music, reload: reloadMusic } = useDevicePolledJson(
    ready,
    "/api/music",
    15_000,
    selectMusic,
  );

  const board = boardOverride ?? polledBoard;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("code");
    if (p) setCode(p.toUpperCase());
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setBoardOverride(null);
  }, [polledBoard]);

  const musicAction = useCallback(
    async (body: MusicActionRequest) => {
      const secret = getDeviceSecret();
      if (!secret) return;
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-secret": secret },
        body: JSON.stringify(body),
      });
      if (res.ok) reloadMusic();
    },
    [reloadMusic],
  );

  const tick = useCallback(
    async (choreId: string) => {
      const secret = getDeviceSecret();
      if (!secret) return;
      setBoardOverride((b) => {
        const base = b ?? polledBoard;
        if (!base) return b;
        return {
          ...base,
          kids: base.kids.map((k) => {
            const chores = k.chores.map((c) =>
              c.id === choreId ? { ...c, done: !c.done } : c,
            );
            return { ...k, chores, doneToday: chores.filter((c) => c.done).length };
          }),
        };
      });
      await fetch("/api/jobs/tick", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-secret": secret },
        body: JSON.stringify({ choreId }),
      }).catch(() => {});
      reloadJobs();
    },
    [polledBoard, reloadJobs],
  );

  const playReminder = useCallback(
    (r: EndpointReminder) => {
      setSpeaking({ text: r.text, label: "Reminder" });
      speak(r.text);
    },
    [setSpeaking],
  );

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
  }, [code, setNote, setRoom, setPhase, heartbeat]);

  useEffect(() => {
    if (phase === "unpaired" && !autoPairTried.current && isWellFormedPairingCode(code)) {
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
      <PairingScreen code={code} note={note} onCodeChange={setCode} onClaim={claim} />
    );
  }

  return (
    <div className="kiosk relative flex h-screen">
      <nav className="flex w-56 flex-none flex-col gap-1.5 border-r border-divider p-5">
        <div className="px-2 pb-4">
          <div className="font-heading text-lg font-medium">{room}</div>
          <div className="text-[11px] text-neutral-500">Home intercom</div>
        </div>
        {RAIL_ITEMS.map(([key, icon, label]) => (
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
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${
            dnd ? "bg-accent-900 text-accent-200" : "text-neutral-500"
          }`}
        >
          <i className="ph ph-moon text-base" />
          {dnd ? "Do not disturb" : "Available"}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-none items-center gap-3 px-7 pb-3 pt-5">
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <span
                className={`dot ${!mock && receiving ? "dot-online" : "dot-offline"}`}
              />
              {mock
                ? "Demo mode — audio disabled"
                : receiving
                  ? "Ready to receive"
                  : "Connecting to audio…"}
            </div>
            {!mock && !receiving && (receiveError || livekitUrl) && (
              <div className="text-[11px] text-accent-200">
                {receiveError ? `${receiveError} · ` : ""}
                {livekitUrl}
              </div>
            )}
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
          <HomeRail
            clockBig={clockBig}
            dateLong={dateLong}
            schedule={schedule}
            board={board}
            reminders={reminders ?? []}
            onOpenSchedule={() => setRail("schedule")}
            onOpenJobs={() => setRail("jobs")}
            onOpenReminders={() => setRail("reminders")}
          />
        )}
        {rail === "reminders" && (
          <RemindersRail
            room={room}
            reminders={reminders ?? []}
            onPlay={playReminder}
          />
        )}
        {rail === "schedule" && (
          <ScheduleRail
            schedule={schedule}
            schedDay={schedDay}
            onSelectDay={setSchedDay}
          />
        )}
        {rail === "jobs" && <JobsRail board={board} onTick={tick} />}
        {rail === "sound" && <SoundRail dnd={dnd} onDndChange={setDoNotDisturb} />}
      </div>

      {media.ringing && !media.incoming && (
        <RingOverlay
          room={room}
          ringing={media.ringing}
          onAnswer={media.answerRing}
          onDecline={media.declineRing}
        />
      )}
      {media.incoming && (
        <IncomingOverlay
          room={room}
          incoming={media.incoming}
          onDismiss={media.leaveMedia}
        />
      )}
      {speaking && (
        <SpeakingOverlay
          room={room}
          speaking={speaking}
          onDismiss={dismissSpeaking}
        />
      )}

      <div ref={media.sinkRef} hidden />
      {note && phase === "error" && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-accent-200">
          {note}
        </div>
      )}
    </div>
  );
}
