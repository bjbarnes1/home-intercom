/**
 * Room-naming scheme. Every conversation type maps to a LiveKit room; the
 * name encodes the kind so tokens and the endpoint can be scoped correctly.
 *
 *   lobby:<householdId>       — every device in ONE household joins this;
 *                               presence + control data messages ride here.
 *   page:<deviceId>           — one-to-one page to a single endpoint.
 *   call:<deviceId>           — two-way call with a single endpoint.
 *   broadcast:<zoneId>        — one-to-many announcement to a zone.
 */

/*
 * One room per household, not one for the platform. A single shared "lobby"
 * meant every panel everywhere was a participant in the same room: presence
 * leaked across households, and listParticipants() — which decides who is
 * reachable for every page, announce and reminder — was a platform-wide
 * listing that grew with the install base rather than with the house.
 */
export function lobbyRoom(householdId: string): string {
  return `lobby:${householdId}`;
}

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
  const prefix = roomName.split(":", 1)[0];
  if (
    prefix === "lobby" ||
    prefix === "page" ||
    prefix === "call" ||
    prefix === "broadcast"
  ) {
    return prefix;
  }
  throw new Error(`Unrecognised room name: ${roomName}`);
}
