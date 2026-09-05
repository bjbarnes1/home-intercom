/**
 * Control-plane messages. Every endpoint permanently joins the LiveKit "lobby"
 * room; the backend delivers these as LiveKit data messages (presence + control
 * on one transport). The endpoint acts on them: join a media room and auto-play,
 * or play a reminder locally.
 *
 * These types are shared by the server (sender) and the PWA (receiver), so they
 * live in a dependency-free module.
 */

export type ControlCommand =
  | JoinRoomCommand
  | RingCommand
  | ReminderCommand
  | HangupCommand
  | PingCommand;

export interface JoinRoomCommand {
  type: "join";
  /** LiveKit room to join (page:<id> / call:<id> / broadcast:<id>). */
  room: string;
  /** Signed token scoped to that room + this device's role. */
  token: string;
  /** How the endpoint should behave on join. */
  mode: "listen" | "talk" | "duplex";
  /** Auto-open audio without user tap (pages on endpoints with autoAnswer). */
  autoAnswer: boolean;
  /** Correlates with an IntercomEvent for audit + hangup. */
  eventId: string;
}

export interface RingCommand {
  type: "ring";
  /** Optional caller label to show while ringing. */
  from?: string;
  eventId: string;
}

export interface ReminderCommand {
  type: "reminder";
  text: string;
  /** Pre-rendered audio (Piper) if available; else endpoint uses SpeechSynthesis. */
  audioUrl?: string;
  /** Chime to play before speaking. */
  sound?: string;
  reminderId: string;
}

export interface HangupCommand {
  type: "hangup";
  eventId: string;
}

export interface PingCommand {
  type: "ping";
  at: number;
}

export function encodeCommand(cmd: ControlCommand): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(cmd));
}

export function decodeCommand(bytes: Uint8Array): ControlCommand {
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as ControlCommand;
}
