"use client";

import { useCallback, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack } from "livekit-client";
import { controllerIdentity } from "@/lib/client/identity";
import { toWsUrl } from "@/lib/client/livekitUrl";
import { attachRemoteAudio } from "@/lib/client/attachAudioTrack";
import { reportClientError } from "@/lib/client/reportError";

export type TalkStatus = "idle" | "connecting" | "live" | "error";

export interface TalkTarget {
  kind: "page" | "call" | "broadcast";
  deviceId?: string;
  zoneId?: string;
}

interface SessionMeta {
  eventId: string;
  reached: string[];
}

/**
 * Hold-to-talk session for the controller. POSTs /api/page to open the room and
 * mint a token, then joins LiveKit and publishes the mic. On stop, sends hangup
 * so endpoints clear overlays and the media room is torn down.
 */
export function useTalk() {
  const [status, setStatus] = useState<TalkStatus>("idle");
  const [message, setMessage] = useState("");
  const roomRef = useRef<Room | null>(null);
  const audioEls = useRef<HTMLAudioElement[]>([]);
  const sessionRef = useRef(0);
  const metaRef = useRef<SessionMeta | null>(null);

  const cleanupAudio = () => {
    for (const el of audioEls.current) el.remove();
    audioEls.current = [];
  };

  const stop = useCallback(async () => {
    sessionRef.current++;
    const room = roomRef.current;
    roomRef.current = null;
    const meta = metaRef.current;
    metaRef.current = null;
    setStatus("idle");
    cleanupAudio();
    if (meta?.eventId) {
      await fetch("/api/page/hangup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventId: meta.eventId,
          deviceIds: meta.reached,
        }),
      }).catch((e) =>
        reportClientError(e, { code: "talk.hangup_request", route: "useTalk" }),
      );
    }
    if (room) {
      await room.disconnect().catch((e) =>
        reportClientError(e, { code: "talk.disconnect", route: "useTalk" }),
      );
    }
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

        const reached = (data.reached ?? []) as string[];
        if (reached.length === 0) {
          const notConnected = (data.notConnected ?? []).length;
          setStatus("error");
          setMessage(
            notConnected > 0
              ? "That screen isn't connected to audio — open or refresh its panel."
              : "Nobody online to hear that.",
          );
          return { reached: 0 };
        }

        metaRef.current = {
          eventId: data.eventId as string,
          reached,
        };

        if (data.mock) {
          setStatus("live");
          return { reached: reached.length };
        }

        const room = new Room();
        room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          const el = attachRemoteAudio(track, document.body);
          if (el) {
            el.hidden = true;
            audioEls.current.push(el as HTMLAudioElement);
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) {
            roomRef.current = null;
            metaRef.current = null;
            setStatus("idle");
            cleanupAudio();
          }
        });

        await room.connect(toWsUrl(data.livekitUrl), data.initiatorToken);
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
        return { reached: reached.length };
      } catch (e) {
        if (cancelled()) return { reached: 0 };
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Failed to start");
        reportClientError(e, { code: "talk.start", route: "useTalk", kind: target.kind });
        return { reached: 0 };
      }
    },
    [],
  );

  return { status, message, start, stop };
}
