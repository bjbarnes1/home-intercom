import { NextResponse } from "next/server";
import { z } from "zod";
import { withRoute } from "@/lib/http";
import { householdTimezone, loadMembers } from "@/lib/reminders/service";
import { activeDevice, invalid, parserFor, unauthorizedDevice } from "@/lib/reminders/http";

export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().trim().min(1).max(500) });

/**
 * POST /api/endpoint/reminders/parse — natural language → a draft for the
 * Creation Modal. Writes nothing: the person sees the draft, fixes anything
 * flagged, and saves through POST /api/endpoint/reminders.
 */
export async function POST(req: Request) {
  return withRoute(async () => {
    const device = await activeDevice(req);
    if (!device) return unauthorizedDevice();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);

    const [timezone, members, parser] = await Promise.all([
      householdTimezone(device.householdId),
      loadMembers(device.householdId),
      parserFor(device.householdId),
    ]);
    // A shared panel has nobody signed in, so "me" is left for the person to pick.
    const outcome = await parser.parse(parsed.data.text, { now: new Date(), timezone, members });
    return NextResponse.json(outcome);
  }, { route: "/api/endpoint/reminders/parse" });
}
