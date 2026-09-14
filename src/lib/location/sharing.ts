/**
 * Sharing consent.
 *
 * Visibility in this household is symmetric: everyone sees the same map,
 * children included. Asymmetric visibility is what turns this class of feature
 * into surveillance for the people inside it, so there is no "who can see me"
 * matrix here on purpose — only "am I sharing at all".
 */

import type { LocationShare, LocationShareMode } from "@prisma/client";

/** The shape the phone and the map both need, without exposing raw rows. */
export interface SharingState {
  mode: LocationShareMode;
  liveUntil: Date | null;
  /** Whether the phone should be reporting anything at all right now. */
  reporting: boolean;
}

/**
 * Resolve a stored share row into the state that applies *now*.
 *
 * LIVE is time-boxed and expiry is decided here, server-side: a phone that goes
 * offline mid-share must not be able to keep broadcasting precise positions
 * just because it never saw the clock run out.
 */
export function resolveSharing(
  share: Pick<LocationShare, "mode" | "liveUntil"> | null,
  now: Date,
): SharingState {
  if (!share || share.mode === "OFF") {
    return { mode: "OFF", liveUntil: null, reporting: false };
  }

  if (share.mode === "LIVE") {
    const expired = !share.liveUntil || share.liveUntil.getTime() <= now.getTime();
    // An expired live share falls back to PLACES rather than off — the person
    // opted into sharing; only the *precision* was temporary.
    return expired
      ? { mode: "PLACES", liveUntil: null, reporting: true }
      : { mode: "LIVE", liveUntil: share.liveUntil, reporting: true };
  }

  return { mode: "PLACES", liveUntil: null, reporting: true };
}

/** Does this state permit storing a full-precision fix? */
export function allowsFullPrecision(state: SharingState): boolean {
  return state.mode === "LIVE";
}
