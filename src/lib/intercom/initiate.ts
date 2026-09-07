import { prisma } from "@/lib/prisma";
import { mintToken } from "@/lib/livekit/token";
import { controlSender } from "@/lib/livekit/control";
import { reportError } from "@/lib/errors/report";
import { pageRoom, callRoom, broadcastRoom } from "@/lib/livekit/rooms";
import { resolveTargets } from "@/lib/zones/resolve";
import { loadHouseholdSnapshot } from "@/lib/presence/snapshot";
import type { JoinRoomCommand, RingCommand } from "@/lib/control/commands";

/**
 * Orchestrates page / call / broadcast:
 *   1. resolve targets from the household presence snapshot
 *   2. audit event
 *   3. mint room tokens
 *   4. push join (auto-open) or ring (call) via the lobby
 *   5. return the initiator token
 */

export type InitiateKind = "page" | "call" | "broadcast";

export interface InitiateInput {
  householdId: string;
  initiatorUserId?: string;
  initiatorIdentity: string;
  kind: InitiateKind;
  targetDeviceId?: string;
  targetZoneId?: string;
}

export interface InitiateResult {
  eventId: string;
  room: string;
  initiatorToken: string;
  reached: string[];
  notConnected: string[];
  suppressedByDnd: string[];
  offline: string[];
}

export async function initiateIntercom(input: InitiateInput): Promise<InitiateResult> {
  const now = new Date();
  const { devices, zoneMembership } = await loadHouseholdSnapshot(
    input.householdId,
    now,
  );

  // Pages and calls must still reach DND rooms; announces/reminders respect DND.
  const respectDoNotDisturb = input.kind !== "page" && input.kind !== "call";

  const resolved = resolveTargets(
    { deviceId: input.targetDeviceId, zoneId: input.targetZoneId },
    devices,
    zoneMembership,
    { onlineOnly: true, respectDoNotDisturb },
  );

  const room =
    input.kind === "broadcast"
      ? broadcastRoom(input.targetZoneId ?? "adhoc")
      : input.kind === "call"
        ? callRoom(input.targetDeviceId ?? "adhoc")
        : pageRoom(input.targetDeviceId ?? "adhoc");

  const endpointMode: JoinRoomCommand["mode"] =
    input.kind === "call" ? "duplex" : "listen";
  const initiatorRole = input.kind === "call" ? "duplex" : "talk";

  const sender = controlSender();
  const connectedList = await sender.connected(resolved.targets);
  const connected = new Set(connectedList);
  const notConnected = resolved.targets.filter((id) => !connected.has(id));

  const kindLabel =
    input.kind === "page" ? "Page" : input.kind === "call" ? "Call" : "Broadcast";
  const event = await prisma.intercomEvent.create({
    data: {
      householdId: input.householdId,
      type: input.kind.toUpperCase() as "PAGE" | "CALL" | "BROADCAST",
      outcome: connectedList.length > 0 ? "DELIVERED" : "MISSED",
      roomName: room,
      initiatorUserId: input.initiatorUserId,
      targetDeviceId: input.targetDeviceId,
      targetZoneId: input.targetZoneId,
      summary: `${kindLabel} · ${input.initiatorIdentity}`,
    },
    select: { id: true },
  });

  await Promise.all(
    connectedList.map(async (deviceId) => {
      try {
        const token = await mintToken({
          identity: deviceId,
          room,
          role: input.kind === "call" ? "duplex" : "listen",
        });
        if (input.kind === "call") {
          const command: RingCommand = {
            type: "ring",
            eventId: event.id,
            room,
            token,
            mode: endpointMode,
          };
          await sender.send([deviceId], command);
        } else {
          const command: JoinRoomCommand = {
            type: "join",
            room,
            token,
            mode: endpointMode,
            autoAnswer: true,
            eventId: event.id,
          };
          await sender.send([deviceId], command);
        }
      } catch (e) {
        reportError(e, {
          code: "intercom.control_send",
          route: "initiateIntercom",
          deviceId,
          kind: input.kind,
          eventId: event.id,
        });
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
    reached: connectedList,
    notConnected,
    suppressedByDnd: resolved.suppressedByDnd,
    offline: resolved.offline,
  };
}
