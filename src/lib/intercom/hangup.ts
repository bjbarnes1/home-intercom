import { RoomServiceClient } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { controlSender } from "@/lib/livekit/control";
import { reportError, reportWarning } from "@/lib/errors/report";

function roomService(): RoomServiceClient | null {
  if (env.mockLocalServices) return null;
  const httpUrl = env.livekit.url.replace(/^ws/, "http");
  return new RoomServiceClient(httpUrl, env.livekit.apiKey, env.livekit.apiSecret);
}

/**
 * End a page/call/broadcast: hangup control commands to endpoints and tear down
 * the LiveKit room so the controller disconnects too.
 *
 * The household is required, and the device list is derived from the stored
 * event rather than taken from the caller. Both used to be the caller's to
 * choose, which let any signed-in user — a child account included — end a
 * conversation in someone else's house and delete their LiveKit room.
 *
 * Returns false when the event is not this household's, so a route can answer
 * 404 rather than silently doing nothing.
 */
export async function hangupIntercom(opts: {
  eventId: string;
  householdId: string;
}): Promise<boolean> {
  const event = await prisma.intercomEvent.findFirst({
    where: { id: opts.eventId, householdId: opts.householdId },
    select: { id: true, roomName: true, targetDeviceId: true, targetZoneId: true },
  });
  if (!event) return false;

  const deviceIds = event.targetDeviceId
    ? [event.targetDeviceId]
    : event.targetZoneId
      ? (
          await prisma.zoneMembership.findMany({
            where: { zoneId: event.targetZoneId, zone: { householdId: opts.householdId } },
            select: { deviceId: true },
          })
        ).map((m) => m.deviceId)
      : [];

  const sender = controlSender();
  if (deviceIds.length > 0) {
    await sender
      .send(opts.householdId, deviceIds, { type: "hangup", eventId: opts.eventId })
      .catch((e) =>
        reportError(e, {
          code: "hangup.send",
          route: "hangupIntercom",
          eventId: opts.eventId,
        }),
      );
  }

  if (event.roomName) {
    const client = roomService();
    if (client) {
      await client.deleteRoom(event.roomName).catch((e) => {
        reportWarning(e, {
          code: "hangup.delete_room",
          route: "hangupIntercom",
          eventId: opts.eventId,
          roomName: event.roomName,
        });
      });
    }
  }

  await prisma.intercomEvent
    .update({
      where: { id: opts.eventId },
      data: { outcome: "ENDED", endedAt: new Date() },
    })
    .catch((e) =>
      reportError(e, {
        code: "hangup.event_update",
        route: "hangupIntercom",
        eventId: opts.eventId,
      }),
    );

  return true;
}
