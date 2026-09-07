import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deviceFromRequest } from "@/lib/auth/context";
import { MusicActionSchema } from "@/lib/music/actions";
import { applyMusicAction, serializeMusic } from "@/lib/music/state";
import { withRoute } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withRoute(async () => {
    const device = await deviceFromRequest(req);
    if (!device || device.pairing !== "ACTIVE") {
      return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
    }
    return NextResponse.json(await serializeMusic(device.householdId));
  }, { route: "/api/music" });
}

export async function POST(req: Request) {
  return withRoute(async () => {
    const device = await deviceFromRequest(req);
    if (!device || device.pairing !== "ACTIVE") {
      return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
    }
    const parsed = MusicActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    try {
      return NextResponse.json(
        await applyMusicAction(device.householdId, parsed.data),
      );
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid action" },
        { status: 400 },
      );
    }
  }, { route: "/api/music" });
}
