import { NextResponse } from "next/server";
import { withRoute } from "@/lib/http";
import { appleMusicConfigured, getDeveloperToken } from "@/lib/music/appleToken";

export const dynamic = "force-dynamic";

/**
 * GET /api/music/apple/token — the MusicKit developer token.
 *
 * This token is designed to be handed to the browser: MusicKit cannot configure
 * itself without it. It identifies the app, never a listener, and the listener's
 * own Music User Token is obtained by the browser directly from Apple and never
 * passes through here.
 *
 * `configured: false` is a normal answer, not an error — a household that has
 * not set up Apple Music gets a screen that says so.
 */
export async function GET() {
  return withRoute(
    async () => {
      if (!appleMusicConfigured()) {
        return NextResponse.json({ configured: false }, { status: 200 });
      }
      const { token, expiresAt } = getDeveloperToken();
      return NextResponse.json(
        { configured: true, token, expiresAt },
        { headers: { "Cache-Control": "no-store" } },
      );
    },
    { route: "/api/music/apple/token" },
  );
}
