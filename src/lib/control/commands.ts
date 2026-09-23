/**
 * Control-plane messages. Every endpoint permanently joins the LiveKit "lobby"
 * room; the backend delivers these as LiveKit data messages (presence + control
 * on one transport). Shared by server (sender) and PWA (receiver).
 */

import { z } from "zod";

const Mode = z.enum(["listen", "talk", "duplex"]);

const JoinRoomCommandSchema = z.object({
  type: z.literal("join"),
  room: z.string(),
  token: z.string(),
  mode: Mode,
  /** Pages/broadcasts auto-open; unused when type is join from current senders. */
  autoAnswer: z.boolean(),
  eventId: z.string(),
});

/** Call rings first — Answer uses room/token/mode to join media. */
const RingCommandSchema = z.object({
  type: z.literal("ring"),
  from: z.string().optional(),
  eventId: z.string(),
  room: z.string(),
  token: z.string(),
  mode: Mode,
});

const ReminderCommandSchema = z.object({
  type: z.literal("reminder"),
  text: z.string(),
  audioUrl: z.string().optional(),
  sound: z.string().optional(),
  reminderId: z.string(),
  /** Quiet hours: softer playback, no chime. */
  whisper: z.boolean().optional(),
  chime: z.boolean().optional(),
});

const AnnounceCommandSchema = z.object({
  type: z.literal("announce"),
  text: z.string(),
  from: z.string().optional(),
  audioUrl: z.string().optional(),
  announcementId: z.string(),
  whisper: z.boolean().optional(),
  chime: z.boolean().optional(),
});

/**
 * Take over what another panel is playing.
 *
 * Carries catalog track ids rather than a playlist: a library playlist id is
 * scoped to the account that owns it and will not resolve on a panel signed in
 * as somebody else, whereas a catalog song id is the same everywhere.
 *
 * Apple Music streams to one device per subscription, so this is a handoff and
 * not a second speaker: the panel that sends it stops.
 */
const MusicHandoffCommandSchema = z.object({
  type: z.literal("musicHandoff"),
  /** Queue as catalog ids, in order. Capped so one message cannot carry a library. */
  trackIds: z.array(z.string().max(64)).min(1).max(100),
  /** Which of them to start on. */
  startIndex: z.number().int().min(0),
  /** Seconds into that track, so the handoff picks up mid-song. */
  startTime: z.number().min(0),
  /** The room it came from, for the arriving panel to say so. */
  from: z.string().max(80).optional(),
  /**
   * Set by a sender that waits to hear the music started before it goes
   * quiet. The receiver answers through /api/music/handoff/ack with this id
   * and the panel it came from. Absent from an older sender, which pauses
   * straight away and expects no answer.
   */
  handoffId: z.string().max(64).optional(),
  fromDeviceId: z.string().max(64).optional(),
});

/**
 * Whether a handoff actually started playing at the other end.
 *
 * A 200 from /api/music/handoff only means the command was published. The
 * sending panel stays audible until this arrives saying the music started, so
 * a target that cannot play — a stale Apple Music token, a queue that will not
 * resolve, a browser that will not start audio — leaves the music where it was
 * instead of leaving two rooms silent.
 */
const MusicHandoffResultCommandSchema = z.object({
  type: z.literal("musicHandoffResult"),
  handoffId: z.string().max(64),
  ok: z.boolean(),
  /** Why it would not play, in words fit for the sending panel's screen. */
  error: z.string().max(200).optional(),
  /** The room that took it, or would not. */
  to: z.string().max(80).optional(),
});

/**
 * Somebody at another panel wants what this one is playing.
 *
 * Only the panel that holds the queue can hand it over — it is the one with
 * the tracks, the position and the account — so a pull is a request to push,
 * not a reach into someone else's player.
 */
const MusicFetchCommandSchema = z.object({
  type: z.literal("musicFetch"),
  /** The panel asking. Where the music should end up. */
  toDeviceId: z.string().min(1).max(64),
  /** The room that asked, so the handing-over panel can say where it went. */
  from: z.string().max(80).optional(),
});

/**
 * Work the player on another panel from this one.
 *
 * Only the panel holding the queue can act on it, so this is the same shape as
 * the handoff: a request to the panel that has the music, not a reach into its
 * player. Volume is absolute rather than a nudge, because two taps racing each
 * other should land somewhere definite rather than compounding.
 */
const MusicControlCommandSchema = z.object({
  type: z.literal("musicControl"),
  action: z.enum(["play", "pause", "next", "previous", "volume"]),
  /** 0–1, required for "volume" and ignored otherwise. */
  value: z.number().min(0).max(1).optional(),
});

const HangupCommandSchema = z.object({
  type: z.literal("hangup"),
  eventId: z.string(),
});

const PingCommandSchema = z.object({
  type: z.literal("ping"),
  at: z.number(),
});

export const ControlCommandSchema = z.discriminatedUnion("type", [
  JoinRoomCommandSchema,
  RingCommandSchema,
  ReminderCommandSchema,
  AnnounceCommandSchema,
  MusicHandoffCommandSchema,
  MusicHandoffResultCommandSchema,
  MusicFetchCommandSchema,
  MusicControlCommandSchema,
  HangupCommandSchema,
  PingCommandSchema,
]);

export type ControlCommand = z.infer<typeof ControlCommandSchema>;
export type JoinRoomCommand = z.infer<typeof JoinRoomCommandSchema>;
export type RingCommand = z.infer<typeof RingCommandSchema>;
export type ReminderCommand = z.infer<typeof ReminderCommandSchema>;
export type AnnounceCommand = z.infer<typeof AnnounceCommandSchema>;
export type MusicHandoffCommand = z.infer<typeof MusicHandoffCommandSchema>;
export type MusicHandoffResultCommand = z.infer<typeof MusicHandoffResultCommandSchema>;
export type MusicFetchCommand = z.infer<typeof MusicFetchCommandSchema>;
export type MusicControlCommand = z.infer<typeof MusicControlCommandSchema>;
export type HangupCommand = z.infer<typeof HangupCommandSchema>;
export type PingCommand = z.infer<typeof PingCommandSchema>;

export function encodeCommand(cmd: ControlCommand): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cmd));
}

export function decodeCommand(bytes: Uint8Array): ControlCommand {
  const text = new TextDecoder().decode(bytes);
  return ControlCommandSchema.parse(JSON.parse(text));
}
