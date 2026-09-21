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
});

const HangupCommandSchema = z.object({
  type: z.literal("hangup"),
  eventId: z.string(),
});

const PingCommandSchema = z.object({
  type: z.literal("ping"),
  at: z.number(),
});

/** Hardware / panel LED cue — no-op on software-only panels without hasLeds. */
const LedCommandSchema = z.object({
  type: z.literal("led"),
  front: z
    .object({
      mode: z.enum(["status", "night", "solid", "off", "pulse"]).optional(),
      color: z.string().max(40).optional(),
      brightness: z.number().min(0).max(100).optional(),
    })
    .optional(),
  rear: z
    .object({
      on: z.boolean().optional(),
      color: z.string().max(40).optional(),
      brightness: z.number().min(0).max(100).optional(),
    })
    .optional(),
});

export const ControlCommandSchema = z.discriminatedUnion("type", [
  JoinRoomCommandSchema,
  RingCommandSchema,
  ReminderCommandSchema,
  AnnounceCommandSchema,
  MusicHandoffCommandSchema,
  HangupCommandSchema,
  PingCommandSchema,
  LedCommandSchema,
]);

export type ControlCommand = z.infer<typeof ControlCommandSchema>;
export type JoinRoomCommand = z.infer<typeof JoinRoomCommandSchema>;
export type RingCommand = z.infer<typeof RingCommandSchema>;
export type ReminderCommand = z.infer<typeof ReminderCommandSchema>;
export type AnnounceCommand = z.infer<typeof AnnounceCommandSchema>;
export type MusicHandoffCommand = z.infer<typeof MusicHandoffCommandSchema>;
export type HangupCommand = z.infer<typeof HangupCommandSchema>;
export type PingCommand = z.infer<typeof PingCommandSchema>;
export type LedCommand = z.infer<typeof LedCommandSchema>;

export function encodeCommand(cmd: ControlCommand): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cmd));
}

export function decodeCommand(bytes: Uint8Array): ControlCommand {
  const text = new TextDecoder().decode(bytes);
  return ControlCommandSchema.parse(JSON.parse(text));
}
