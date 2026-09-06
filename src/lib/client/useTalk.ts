"use client";

import { useCallback, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack, Track } from "livekit-client";
import { controllerIdentity } from "@/lib/client/identity";

export type TalkStatus = "idle" | "connecting" | "live" | "error";

export interface TalkTarget {
  kind: "page" | "call" | "broadcast";
  deviceId?: string;
  zoneId?: string;
}

/**
 * Hold-to-talk session for the controller. POSTs /api/page to open the room and
 * mint a token, then joins LiveKit and publishes the mic. Under
 * MOCK_LOCAL_SERVICES (no reachable SFU) it simulates the on-air state so the
 * deployed demo still feels live.
 */
export function useTalk() {
  const [status, setStatus] = useState<TalkStatus>("idle");
  const [message, setMessage] = useState("");
  const roomRef = useRef<Room | null>(null);
  const audioEls = useRef<HTMLAudioElement[]>([]);
  // Bumped on every start and every stop; an in-flight start whose id no longer
  // matches was cancelled (e.g. a quick release) and must tear itself down.
  const sessionRef = useRef(0);

  const cleanupAudio = () => {
    for (const el of audioEls.current) el.remove();
    audioEls.current = [];
  };

  const stop = useCallback(async () => {
    sessionRef.current++; // invalidate any in-flight start
    const room = roomRef.current;
    roomRef.current = null;
    setStatus("idle");
    cleanupAudio();
    if (room) await room.disconnect().catch(() => {});
  }, []);

  const start = useCallback(
    async (target: TalkTarget): Promise<{ reached: number }> => {
      const my = ++sessionRef.current;
      const cancelled = () => sessionRef.current !== my;

      setStatus("connecting");
      setMessage("");
      try {
        const res = await fetch("/api/page", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: target.kind,
            initiatorIdentity: controllerIdentity(),
            targetDeviceId: target.deviceId,
            targetZoneId: target.zoneId,
          }),
        });
        if (!res.ok) throw new Error(`Couldn't start (${res.status})`);
        const data = await res.json();
        if (cancelled()) return { reached: 0 };

        const reached = (data.reached ?? []).length;
        if (reached === 0) {
          setStatus("error");
          setMessage("Nobody online to hear that.");
          return { reached: 0 };
        }

        if (data.mock) {
          // No real SFU reachable — simulate the open channel.
          setStatus("live");
          return { reached };
        }

        const room = new Room();
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            el.autoplay = true;
            el.hidden = true;
            document.body.appendChild(el);
            audioEls.current.push(el);
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) stop();
        });

        await room.connect(data.livekitUrl, data.initiatorToken);
        // Released (or superseded) while connecting → tear down, don't open mic.
        if (cancelled()) {
          await room.disconnect().catch(() => {});
          return { reached: 0 };
        }
        roomRef.current = room;
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled()) {
          roomRef.current = null;
          await room.disconnect().catch(() => {});
          return { reached: 0 };
        }
        setStatus("live");
        return { reached };
      } catch (e) {
        if (cancelled()) return { reached: 0 };
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Failed to start");
        return { reached: 0 };
      }
    },
    [stop],
  );

  return { status, message, start, stop };
}
