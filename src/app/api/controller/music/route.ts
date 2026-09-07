import { NextResponse } from "next/server";
import { currentHouseholdId } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { MusicActionSchema } from "@/lib/music/actions";
import { applyMusicAction, serializeMusic } from "@/lib/music/state";

export const dynamic = "force-dynamic";

/** GET /api/controller/music — household music state for the parent phone. */
export async function GET() {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    return NextResponse.json(await serializeMusic(householdId));
  }, { route: "/api/controller/music" });
}

/** POST /api/controller/music — playback controls from the parent phone. */
export async function POST(req: Request) {
  return withAuth(async () => {
    const householdId = await currentHouseholdId();
    const parsed = MusicActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    try {
      return NextResponse.json(await applyMusicAction(householdId, parsed.data));
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Invalid action" },
        { status: 400 },
      );
    }
  }, { route: "/api/controller/music" });
}
