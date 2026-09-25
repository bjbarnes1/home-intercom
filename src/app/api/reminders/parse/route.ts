import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/context";
import { withAuth } from "@/lib/http";
import { createReminder, householdTimezone, loadMembers } from "@/lib/reminders/service";
import { invalid, parserFor, reminderErrorResponse } from "@/lib/reminders/http";

export const dynamic = "force-dynamic";

const Body = z.object({
  text: z.string().trim().min(1).max(500),
  /**
   * true (the default, and what the controller has always relied on): save the
   * reminder if the request was complete enough. false: return the draft only,
   * for a surface that shows it for confirmation first, as the Hub does.
   */
  commit: z.boolean().default(true),
});

/**
 * POST /api/reminders/parse — natural language → reminder, via ReminderParser
 * (src/lib/reminders/ai/parser.ts).
 *
 * The model extracts slots, code resolves them against this household, and
 * nothing the model says is written directly. Where it rings is decided in code
 * too (the assignee's own panel, else the widest zone), not chosen by the model
 * from a list of device ids as before.
 */
export async function POST(req: Request) {
  return withAuth(async () => {
    const user = await requireUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);

    const [timezone, members, parser] = await Promise.all([
      householdTimezone(user.householdId),
      loadMembers(user.householdId),
      parserFor(user.householdId),
    ]);
    const speaker = members.find((m) => m.kind === "user" && m.id === user.id) ?? null;
    const outcome = await parser.parse(parsed.data.text, { now: new Date(), timezone, members, speaker });

    if (!parsed.data.commit) return NextResponse.json(outcome);

    const { draft } = outcome;
    if (!draft.when) {
      return NextResponse.json(
        { error: outcome.issues.join(" ") || "Couldn't tell when that should go off.", ...outcome },
        { status: 422 },
      );
    }
    try {
      const reminder = await createReminder(
        user.householdId,
        {
          title: draft.title,
          details: draft.details,
          assignee: draft.assignee ? { kind: draft.assignee.kind, id: draft.assignee.id } : null,
          when: draft.when,
        },
        { userId: user.id, label: user.name },
      );
      const note = outcome.issues.length ? ` (${outcome.issues.join(" ")})` : "";
      return NextResponse.json({ reminder, confirmation: `Set: ${outcome.summary}${note}`, ...outcome });
    } catch (e) {
      return reminderErrorResponse(e);
    }
  }, { route: "/api/reminders/parse" });
}
