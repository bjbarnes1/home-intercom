"use client";

import type { RemoteTrack } from "livekit-client";
import { Track } from "livekit-client";

/** Attach a remote LiveKit audio track into a parent element for playback. */
export function attachRemoteAudio(
  track: RemoteTrack,
  parent: HTMLElement,
): HTMLMediaElement | null {
  if (track.kind !== Track.Kind.Audio) return null;
  const el = track.attach();
  el.autoplay = true;
  parent.appendChild(el);
  return el;
}
