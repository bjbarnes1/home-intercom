"use client";

import { useCallback, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack } from "livekit-client";
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
        body: JSON.stringify({ eventId: meta.eventId }),
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

  /*
   * Hang up an event by id, without reading metaRef.
   *
   * A tap-and-release inside ~200ms has stop() run while start() is still
   * awaiting the server. stop() reads metaRef before start() has written it, so
   * it sends no hangup — but start()'s round trip has already created the event
   * and pushed `join {autoAnswer:true}` to the panel. The kitchen sat in the
   * incoming overlay until somebody tapped again, and that tap hung up the
   * stale event rather than the new one. So the cancelled branches have to end
   * the session they opened, themselves.
   */
  const hangUpEvent = useCallback(async (eventId: string) => {
    await fetch("/api/page/hangup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventId }),
    }).catch((e) =>
      reportClientError(e, { code: "talk.hangup_cancelled", route: "useTalk" }),
    );
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
            targetDeviceId: target.deviceId,
            targetZoneId: target.zoneId,
          }),
        });
        if (!res.ok) throw new Error(`Couldn't start (${res.status})`);
        const data = await res.json();
        if (cancelled()) {
          if (data.eventId) await hangUpEvent(data.eventId as string);
          return { reached: 0 };
        }

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
          await hangUpEvent(data.eventId as string);
          return { reached: 0 };
        }
        roomRef.current = room;
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled()) {
          roomRef.current = null;
          await room.disconnect().catch(() => {});
          await hangUpEvent(data.eventId as string);
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
    [hangUpEvent],
  );

  return { status, message, start, stop };
}
