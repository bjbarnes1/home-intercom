import { NextResponse } from "next/server";
import { withRoute } from "@/lib/http";
import { actOnOccurrence } from "@/lib/reminders/service";
import { OccurrenceActionSchema } from "@/lib/reminders/types";
import { activeDevice, invalid, reminderErrorResponse, unauthorizedDevice } from "@/lib/reminders/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/endpoint/reminders/occurrences/[id] — Complete, Dismiss or Snooze
 * from a panel. The occurrence is looked up inside the panel's own household,
 * so an id from another house is simply not found.
 */
export async function POST(req: Request, ctx: Ctx) {
  return withRoute(async () => {
    const device = await activeDevice(req);
    if (!device) return unauthorizedDevice();
    const parsed = OccurrenceActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    const { id } = await ctx.params;
    try {
      const result = await actOnOccurrence(device.householdId, id, parsed.data, {
        deviceId: device.id,
        label: device.room ?? device.displayName,
      });
      return NextResponse.json(result);
    } catch (e) {
      return reminderErrorResponse(e);
    }
  }, { route: "/api/endpoint/reminders/occurrences/[id]" });
}
