import { RoomServiceClient } from "livekit-server-sdk";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { controlSender } from "@/lib/livekit/control";

function roomService(): RoomServiceClient | null {
  if (env.mockLocalServices) return null;
  const httpUrl = env.livekit.url.replace(/^ws/, "http");
  return new RoomServiceClient(httpUrl, env.livekit.apiKey, env.livekit.apiSecret);
}

/**
 * End a page/call/broadcast: hangup control commands to endpoints and tear down
 * the LiveKit room so the controller disconnects too.
 */
export async function hangupIntercom(opts: {
  eventId: string;
  deviceIds: string[];
}): Promise<void> {
  const event = await prisma.intercomEvent.findUnique({
    where: { id: opts.eventId },
    select: { id: true, roomName: true },
  });
  if (!event) return;

  const sender = controlSender();
  if (opts.deviceIds.length > 0) {
    await sender
      .send(opts.deviceIds, { type: "hangup", eventId: opts.eventId })
      .catch((e) => console.error("hangup send failed", e));
  }

  if (event.roomName) {
    const client = roomService();
    if (client) {
      await client.deleteRoom(event.roomName).catch(() => {
        /* room may already be gone */
      });
    }
  }

  await prisma.intercomEvent
    .update({
      where: { id: opts.eventId },
      data: { outcome: "ENDED", endedAt: new Date() },
    })
    .catch(() => {});
}
