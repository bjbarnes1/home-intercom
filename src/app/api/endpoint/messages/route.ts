import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { withRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

const MESSAGE_TYPES = ["PAGE", "CALL", "BROADCAST", "ANNOUNCE"] as const;

/**
 * GET /api/endpoint/messages — recent intercom activity for this household
 * (pages, calls, live broadcasts, text announces). Device-authed.
 */
export async function GET(req: Request) {
  return withRoute(async () => {
    const device = await deviceFromRequest(req);
    if (!device || device.pairing !== "ACTIVE") {
      return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
    }

    const events = await prisma.intercomEvent.findMany({
      where: {
        householdId: device.householdId,
        type: { in: [...MESSAGE_TYPES] },
      },
      orderBy: { startedAt: "desc" },
      take: 80,
      include: {
        initiator: { select: { name: true } },
        targetDevice: { select: { displayName: true } },
        targetZone: { select: { name: true } },
      },
    });

    const messages = events.map((e) => {
      const target =
        e.targetDevice?.displayName ?? e.targetZone?.name ?? null;
      const kindLabel =
        e.type === "PAGE"
          ? "Page"
          : e.type === "CALL"
            ? "Call"
            : e.type === "BROADCAST"
              ? "Broadcast"
              : "Announce";
      return {
        id: e.id,
        type: e.type,
        kindLabel,
        outcome: e.outcome,
        summary: e.summary,
        from: e.initiator?.name ?? null,
        target,
        startedAt: e.startedAt.toISOString(),
        endedAt: e.endedAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ messages });
  }, { route: "/api/endpoint/messages" });
}
