import { NextResponse } from "next/server";
import { z } from "zod";
import { reportError } from "@/lib/errors/report";

export const dynamic = "force-dynamic";

const Body = z.object({
  code: z.string().min(1).max(120),
  route: z.string().max(200).optional(),
  message: z.string().min(1).max(500),
  stack: z.string().max(2000).optional(),
  href: z.string().max(500).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/telemetry/client-error — accept browser/wall-panel error beacons.
 * No auth: payloads are truncated and treated as untrusted log input only.
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const { code, route, message, stack, href, context } = parsed.data;
    reportError(new Error(message), {
      code: `client.${code}`,
      route: route ?? "client",
      stack,
      href,
      ...context,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    reportError(e, { code: "telemetry.client-error", route: "/api/telemetry/client-error" });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
