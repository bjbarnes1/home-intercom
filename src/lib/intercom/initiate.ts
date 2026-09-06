import { prisma } from "@/lib/prisma";
import { mintToken } from "@/lib/livekit/token";
import { controlSender } from "@/lib/livekit/control";
import { pageRoom, callRoom, broadcastRoom } from "@/lib/livekit/rooms";
import { resolveTargets, type DeviceSnapshot } from "@/lib/zones/resolve";
import type { JoinRoomCommand } from "@/lib/control/commands";

/**
 * Orchestrates the thinnest vertical slice that exercises the whole
 * media + control architecture: initiate a page/call/broadcast.
 *
 *   1. resolve the target to concrete online endpoints
 *   2. record an audit event (no audio, metadata only)
 *   3. mint room-scoped tokens (least privilege per role)
 *   4. push a `join` control command to each endpoint via the lobby
 *   5. return the initiator's own token so the caller can join and talk
 */

const PRESENCE_WINDOW_MS = 20_000;

function isOnline(lastSeenAt: Date | null | undefined, now: Date): boolean {
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() <= PRESENCE_WINDOW_MS;
}

export type InitiateKind = "page" | "call" | "broadcast";

export interface InitiateInput {
  householdId: string;
  initiatorUserId?: string;
  /** The controller's own participant identity (to receive its token). */
  initiatorIdentity: string;
  kind: InitiateKind;
  targetDeviceId?: string;
  targetZoneId?: string;
}

export interface InitiateResult {
  eventId: string;
  room: string;
  /** Token for the initiator to join and publish. */
  initiatorToken: string;
  reached: string[];
  suppressedByDnd: string[];
  offline: string[];
}

export async function initiateIntercom(input: InitiateInput): Promise<InitiateResult> {
  const now = new Date();

  const [devices, memberships] = await Promise.all([
    prisma.device.findMany({
      where: { householdId: input.householdId, pairing: "ACTIVE" },
      select: { id: true, lastSeenAt: true, doNotDisturb: true },
    }),
    prisma.zoneMembership.findMany({
      where: { zone: { householdId: input.householdId } },
      select: { zoneId: true, deviceId: true },
    }),
  ]);

  const snapshot: DeviceSnapshot[] = devices.map((d) => ({
    id: d.id,
    online: isOnline(d.lastSeenAt, now),
    doNotDisturb: d.doNotDisturb,
  }));

  const zoneMembership: Record<string, string[]> = {};
  for (const m of memberships) {
    (zoneMembership[m.zoneId] ??= []).push(m.deviceId);
  }

  const resolved = resolveTargets(
    { deviceId: input.targetDeviceId, zoneId: input.targetZoneId },
    snapshot,
    zoneMembership,
    { onlineOnly: true },
  );

  // Room name derives from the target. Broadcast uses the zone; page/call use
  // the (single) device id, else fall back to a per-event room for a zone call.
  const room =
    input.kind === "broadcast"
      ? broadcastRoom(input.targetZoneId ?? "adhoc")
      : input.kind === "call"
        ? callRoom(input.targetDeviceId ?? "adhoc")
        : pageRoom(input.targetDeviceId ?? "adhoc");

  const endpointMode: JoinRoomCommand["mode"] =
    input.kind === "call" ? "duplex" : "listen";
  const initiatorRole = input.kind === "call" ? "duplex" : "talk";

  const event = await prisma.intercomEvent.create({
    data: {
      householdId: input.householdId,
      type: input.kind.toUpperCase() as "PAGE" | "CALL" | "BROADCAST",
      outcome: resolved.targets.length > 0 ? "DELIVERED" : "MISSED",
      roomName: room,
      initiatorUserId: input.initiatorUserId,
      targetDeviceId: input.targetDeviceId,
      targetZoneId: input.targetZoneId,
    },
    select: { id: true },
  });

  // Mint a scoped token per reached endpoint and push the join command. A send
  // that fails (e.g. the endpoint dropped its lobby connection) must not fail
  // the whole request — the initiator still gets its token to talk.
  const sender = controlSender();
  await Promise.all(
    resolved.targets.map(async (deviceId) => {
      try {
        const token = await mintToken({
          identity: deviceId,
          room,
          role: input.kind === "call" ? "duplex" : "listen",
        });
        const command: JoinRoomCommand = {
          type: "join",
          room,
          token,
          mode: endpointMode,
          autoAnswer: input.kind !== "call", // pages/broadcasts auto-open; calls ring
          eventId: event.id,
        };
        await sender.send([deviceId], command);
      } catch (e) {
        console.error(`control send to ${deviceId} failed`, e);
      }
    }),
  );

  const initiatorToken = await mintToken({
    identity: input.initiatorIdentity,
    name: "Controller",
    room,
    role: initiatorRole,
  });

  return {
    eventId: event.id,
    room,
    initiatorToken,
    reached: resolved.targets,
    suppressedByDnd: resolved.suppressedByDnd,
    offline: resolved.offline,
  };
}
