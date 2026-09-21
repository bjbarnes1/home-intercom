"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { saveDeviceCredentials } from "@/lib/client/identity";
import { isWellFormedPairingCode } from "@/lib/devices/pairing";
import PairingScreen from "@/app/endpoint/PairingScreen";
import { useMediaSession } from "@/app/endpoint/useMediaSession";
import { useEndpointPresence } from "@/app/endpoint/useEndpointPresence";
import { useAppleMusic, type AppleMusic } from "./music/useAppleMusic";
import CallCard from "./_components/CallCard";
import RingCard from "./_components/RingCard";
import SpeakingCard from "./_components/SpeakingCard";

/**
 * The Hub as a real panel rather than a prototype.
 *
 * This is the seam of the migration: the intercom engine is unchanged — the
 * same heartbeat, the same LiveKit lobby, the same control commands the wall
 * panel has always run — and only the presentation is new. Everything the
 * engine can interrupt the room with now arrives as an Overlay Card, so a call
 * and an announcement look like the rest of the Hub instead of a separate app
 * bolted to the side of it.
 *
 * Interruptions are mounted here, above every screen, because that is what an
 * interruption is: it does not belong to Home or to Music, and navigating must
 * not dismiss it.
 */

interface HubState {
  /** The music session, owned here so a handoff lands whatever screen is up. */
  music: AppleMusic;
  /** The room this panel speaks for, as the household named it. */
  room: string;
  /** Live lobby connection — the panel can be reached right now. */
  receiving: boolean;
  doNotDisturb: boolean;
  setDoNotDisturb: (value: boolean) => void;
}

const Ctx = createContext<HubState | null>(null);

/** Live panel state for any Hub screen that needs it. */
export function useHub(): HubState {
  const value = useContext(Ctx);
  if (!value) throw new Error("useHub must be used inside HubRuntime");
  return value;
}

/** The panel's one music session. */
export function useHubMusic(): AppleMusic {
  return useHub().music;
}

export default function HubRuntime({ children }: { children: ReactNode }) {
  const media = useMediaSession();

  /**
   * One music session for the whole panel, mounted here rather than on the
   * Music screen. A handoff can arrive while the Hub is showing the clock, and
   * it has to start playing anyway — a player that only exists on the screen
   * that shows it would drop every one of them.
   */
  const music = useAppleMusic();
  const acceptHandoff = music.acceptHandoff;
  const {
    phase,
    setPhase,
    note,
    setNote,
    room,
    setRoom,
    dnd,
    setDoNotDisturb,
    etiquette,
    receiving,
    speaking,
    dismissSpeaking,
    heartbeat,
  } = useEndpointPresence(media, {
    onMusicHandoff: useCallback(
      (cmd: { trackIds: string[]; startIndex: number; startTime: number }) => acceptHandoff(cmd),
      [acceptHandoff],
    ),
  });

  const { sinkRef, incoming, ringing, answerRing, declineRing, leaveMedia } = media;
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  const answer = useCallback(() => {
    setConnectedAt(Date.now());
    answerRing();
  }, [answerRing]);

  const hangUp = useCallback(() => {
    setConnectedAt(null);
    void leaveMedia();
  }, [leaveMedia]);

  const [code, setCode] = useState("");
  const autoPairTried = useRef(false);

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
      void heartbeat();
    } catch {
      setNote("Pairing failed");
    }
  }, [code, heartbeat, setNote, setPhase, setRoom]);

  // A code pasted or scanned in full pairs without needing the button.
  useEffect(() => {
    if (phase === "unpaired" && !autoPairTried.current && isWellFormedPairingCode(code)) {
      autoPairTried.current = true;
      void claim();
    }
  }, [phase, code, claim]);

  return (
    <Ctx.Provider value={{ music, room, receiving, doNotDisturb: dnd, setDoNotDisturb }}>
      {/* Remote audio lands here; it must outlive every screen change. */}
      <div ref={sinkRef} aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden" />

      {phase === "unpaired" ? (
        <PairingScreen code={code} note={note} onCodeChange={setCode} onClaim={claim} />
      ) : (
        children
      )}

      {/* One interruption at a time, most urgent first: a person waiting to be
          answered outranks a connected call, which outranks a recorded voice. */}
      {ringing ? (
        <RingCard who={ringing.title} room={room} onAnswer={answer} onDecline={declineRing} />
      ) : incoming ? (
        <CallCard
          who={incoming.title}
          mode={incoming.mode === "duplex" ? "Two-way call" : "Listening"}
          startedAt={connectedAt ?? undefined}
          footnote="Hanging up returns you to the Hub, right where you left it"
          onHangUp={hangUp}
        />
      ) : speaking ? (
        <SpeakingCard
          from={speaking.label === "Reminder" ? undefined : speaking.label.replace(/^Announcement · /, "")}
          label={speaking.label === "Reminder" ? "Reminder" : "Broadcast message"}
          text={speaking.text}
          dwellSec={etiquette.announceDwellSec}
          onDismiss={dismissSpeaking}
        />
      ) : null}
    </Ctx.Provider>
  );
}
