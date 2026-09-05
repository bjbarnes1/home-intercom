"use client";

import { useCallback, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
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

  const stop = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    setStatus("idle");
    if (room) await room.disconnect().catch(() => {});
  }, []);

  const start = useCallback(async (target: TalkTarget): Promise<{ reached: number }> => {
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
      roomRef.current = room;
      room.on(RoomEvent.Disconnected, () => {
        if (roomRef.current === room) stop();
      });
      await room.connect(data.livekitUrl, data.initiatorToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      setStatus("live");
      return { reached };
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Failed to start");
      return { reached: 0 };
    }
  }, [stop]);

  return { status, message, start, stop };
}
