"use client";

import { useCallback, useRef, useState } from "react";
import { Room, RoomEvent, RemoteTrack } from "livekit-client";
import { attachRemoteAudio } from "@/lib/client/attachAudioTrack";
import { getDeviceSecret } from "@/lib/client/identity";
import type { Incoming, RingOffer } from "./types";

/**
 * Media-plane session for the wall panel: join/leave LiveKit rooms for pages,
 * calls, and broadcast listen. Separate from the lobby control channel.
 */
export function useMediaSession() {
  const mediaRef = useRef<Room | null>(null);
  const sinkRef = useRef<HTMLDivElement | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [ringing, setRinging] = useState<RingOffer | null>(null);

  const leaveMedia = useCallback(async () => {
    const r = mediaRef.current;
    mediaRef.current = null;
    setIncoming(null);
    if (r) await r.disconnect().catch(() => {});
  }, []);

  const joinMedia = useCallback(
    async (url: string, token: string, mode: string, title: string) => {
      await leaveMedia();
      setIncoming({ title: "Connecting…", mode });
      const r = new Room();
      mediaRef.current = r;
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (sinkRef.current) attachRemoteAudio(track, sinkRef.current);
      });
      r.on(RoomEvent.Disconnected, () => {
        if (mediaRef.current === r) leaveMedia();
      });
      r.on(RoomEvent.ParticipantDisconnected, () => {
        if (mediaRef.current === r && r.remoteParticipants.size === 0) leaveMedia();
      });
      await r.connect(url, token);
      if (mode === "duplex") await r.localParticipant.setMicrophoneEnabled(true);
      setIncoming({ title, mode });
    },
    [leaveMedia],
  );

  const answerRing = useCallback(() => {
    const r = ringing;
    if (!r) return;
    setRinging(null);
    setTimeout(() => joinMedia(r.url, r.token, r.mode, "In call"), 0);
  }, [ringing, joinMedia]);

  const declineRing = useCallback(async () => {
    const offer = ringing;
    setRinging(null);
    if (!offer?.eventId) return;
    const secret = getDeviceSecret();
    if (!secret) return;
    await fetch("/api/endpoint/decline", {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-secret": secret },
      body: JSON.stringify({ eventId: offer.eventId }),
    }).catch(() => {});
  }, [ringing]);

  return {
    sinkRef,
    incoming,
    ringing,
    setRinging,
    joinMedia,
    leaveMedia,
    answerRing,
    declineRing,
  };
}
