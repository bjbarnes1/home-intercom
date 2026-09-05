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

type Phase = "loading" | "unpaired" | "online" | "onair" | "error";

export default function EndpointPage() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [note, setNote] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [onAirLabel, setOnAirLabel] = useState<string>("");

  const lobbyRef = useRef<Room | null>(null);
  const mediaRef = useRef<Room | null>(null);
  const audioSinkRef = useRef<HTMLDivElement | null>(null);

  // --- media room (page/broadcast/call) ---------------------------------
  const leaveMedia = useCallback(async () => {
    const room = mediaRef.current;
    mediaRef.current = null;
    if (room) await room.disconnect();
    setPhase((p) => (p === "onair" ? "online" : p));
    setOnAirLabel("");
  }, []);

  const joinMedia = useCallback(
    async (url: string, token: string, mode: string) => {
      await leaveMedia();
      const room = new Room();
      mediaRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio && audioSinkRef.current) {
          const el = track.attach();
          el.autoplay = true;
          audioSinkRef.current.appendChild(el);
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (mediaRef.current === room) leaveMedia();
      });

      await room.connect(url, token);
      if (mode === "duplex" || mode === "talk") {
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      setPhase("onair");
      setOnAirLabel(mode === "duplex" ? "In call" : "Incoming page");
    },
    [leaveMedia],
  );

  // --- lobby (presence + control) ---------------------------------------
  const connectLobby = useCallback(async () => {
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

      // (Re)connect to the lobby room for control messages.
      if (!lobbyRef.current) {
        const room = new Room();
        lobbyRef.current = room;
        room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
          try {
            const cmd = decodeCommand(payload);
            if (cmd.type === "join") {
              joinMedia(data.livekitUrl, cmd.token, cmd.mode);
            } else if (cmd.type === "hangup") {
              leaveMedia();
            }
          } catch {
            /* ignore malformed control message */
          }
        });
        await room.connect(data.livekitUrl, data.lobbyToken);
      }
      setPhase((p) => (p === "onair" ? p : "online"));
    } catch (e) {
      setPhase("error");
      setNote(e instanceof Error ? e.message : "Connection failed");
    }
  }, [joinMedia, leaveMedia]);

  useEffect(() => {
    connectLobby();
    const heartbeat = setInterval(() => {
      const secret = getDeviceSecret();
      if (secret) {
        fetch("/api/presence", {
          method: "POST",
          headers: { "x-device-secret": secret },
        }).catch(() => {});
      }
    }, 10_000);
    return () => clearInterval(heartbeat);
  }, [connectLobby]);

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
        setNote(data.error ?? "Pairing failed");
        return;
      }
      saveDeviceCredentials(data.device.id, data.device.deviceSecret);
      setPhase("loading");
      connectLobby();
    } catch {
      setNote("Pairing failed");
    }
  }, [code, connectLobby]);

  return (
    <main className="kiosk flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      {phase === "unpaired" ? (
        <div className="flex w-full max-w-xs flex-col gap-4">
          <h1 className="text-2xl font-semibold">Pair this device</h1>
          <p className="text-sm text-slate-400">
            Enter the 6-character code shown in the Controller app.
          </p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            className="rounded-xl bg-slate-800 px-4 py-4 text-center text-2xl tracking-[0.4em]"
            placeholder="ABC234"
          />
          <button
            onClick={claim}
            className="rounded-xl bg-sky-600 px-6 py-4 text-lg font-medium hover:bg-sky-500"
          >
            Pair
          </button>
          {note && <p className="text-sm text-amber-300">{note}</p>}
        </div>
      ) : (
        <>
          <div
            className={`flex h-40 w-40 items-center justify-center rounded-full text-lg font-medium ${
              phase === "onair" ? "animate-pulse bg-emerald-600" : "bg-slate-800"
            }`}
          >
            {phase === "onair"
              ? onAirLabel || "On air"
              : phase === "online"
                ? "Ready"
                : phase === "error"
                  ? "Error"
                  : "Connecting…"}
          </div>
          <p className="text-sm text-slate-400">
            {getDeviceId() ? `Device ${getDeviceId()}` : ""}
          </p>
          {note && <p className="text-sm text-amber-300">{note}</p>}
        </>
      )}

      {/* Remote audio elements attach here. */}
      <div ref={audioSinkRef} hidden />
    </main>
  );
}
