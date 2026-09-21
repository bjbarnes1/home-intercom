/**
 * Shapes the panel runtime passes between the presence socket and the media
 * session. Screens keep their own types — these are only the handful both
 * hooks have to agree on.
 */

export type Phase = "loading" | "unpaired" | "ready" | "error";

/** A page or call arriving at this panel. */
export interface Incoming {
  title: string;
  mode: string;
}

/** A ring the panel can answer: everything needed to join the room. */
export interface RingOffer {
  url: string;
  token: string;
  mode: string;
  title: string;
  eventId: string;
}

/** An announcement the panel is speaking, or about to. */
export interface Speaking {
  text: string;
  label: string;
  audioUrl?: string | null;
}
