import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { actOnOccurrence } from "@/lib/reminders/service";
import { OccurrenceActionSchema } from "@/lib/reminders/types";
import { invalid, reminderErrorResponse } from "@/lib/reminders/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/reminders/occurrences/[id] — the same actions, from a signed-in phone. */
export async function POST(req: Request, ctx: Ctx) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = OccurrenceActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    const { id } = await ctx.params;
    try {
      const result = await actOnOccurrence(user.householdId, id, parsed.data, {
        userId: user.id,
        label: user.name,
      });
      return NextResponse.json(result);
    } catch (e) {
      return reminderErrorResponse(e);
    }
  }, { route: "/api/reminders/occurrences/[id]" });
}
