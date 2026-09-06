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
});

const AnnounceCommandSchema = z.object({
  type: z.literal("announce"),
  text: z.string(),
  from: z.string().optional(),
  audioUrl: z.string().optional(),
  announcementId: z.string(),
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
  HangupCommandSchema,
  PingCommandSchema,
]);

export type ControlCommand = z.infer<typeof ControlCommandSchema>;
export type JoinRoomCommand = z.infer<typeof JoinRoomCommandSchema>;
export type RingCommand = z.infer<typeof RingCommandSchema>;
export type ReminderCommand = z.infer<typeof ReminderCommandSchema>;
export type AnnounceCommand = z.infer<typeof AnnounceCommandSchema>;
export type HangupCommand = z.infer<typeof HangupCommandSchema>;
export type PingCommand = z.infer<typeof PingCommandSchema>;

export function encodeCommand(cmd: ControlCommand): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cmd));
}

export function decodeCommand(bytes: Uint8Array): ControlCommand {
  const text = new TextDecoder().decode(bytes);
  return ControlCommandSchema.parse(JSON.parse(text));
}
