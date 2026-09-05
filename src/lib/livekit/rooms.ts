/**
 * Room-naming scheme. Every conversation type maps to a LiveKit room; the
 * name encodes the kind so tokens and the endpoint can be scoped correctly.
 *
 *   lobby                     — every device permanently joins this; presence +
 *                               control data messages ride here.
 *   page:<deviceId>           — one-to-one page to a single endpoint.
 *   call:<deviceId>           — two-way call with a single endpoint.
 *   broadcast:<zoneId>        — one-to-many announcement to a zone.
 */

export const LOBBY_ROOM = "lobby";

export type RoomKind = "lobby" | "page" | "call" | "broadcast";

export function pageRoom(deviceId: string): string {
  return `page:${deviceId}`;
}

export function callRoom(deviceId: string): string {
  return `call:${deviceId}`;
}

export function broadcastRoom(zoneId: string): string {
  return `broadcast:${zoneId}`;
}

export function roomKind(roomName: string): RoomKind {
  if (roomName === LOBBY_ROOM) return "lobby";
  const prefix = roomName.split(":", 1)[0];
  if (prefix === "page" || prefix === "call" || prefix === "broadcast") {
    return prefix;
  }
  throw new Error(`Unrecognised room name: ${roomName}`);
}
