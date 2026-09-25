import { NextResponse } from "next/server";
import type { Device } from "@prisma/client";
import type { ZodError } from "zod";
import { deviceFromRequest } from "@/lib/auth/context";
import { ReminderError } from "./service";
import { ReminderParser } from "./ai/parser";
import { throttleReminderParse } from "@/lib/ratelimit";

/** Shared plumbing for the reminder routes, so each stays a few lines. */

/** The panel calling, or null. A panel that is not ACTIVE is not a panel yet. */
export async function activeDevice(req: Request): Promise<Device | null> {
  const device = await deviceFromRequest(req);
  return device && device.pairing === "ACTIVE" ? device : null;
}

export function unauthorizedDevice() {
  return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
}

export function invalid(error: ZodError) {
  return NextResponse.json({ error: "Invalid request", issues: error.flatten() }, { status: 400 });
}

/** Map a domain error to its HTTP shape; rethrow anything else for withRoute. */
export function reminderErrorResponse(e: unknown) {
  if (e instanceof ReminderError) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

/**
 * The parser to use for this household right now. Over its AI allowance it
 * gets the offline parser rather than an error: the reminder still gets made,
 * with a little less understanding.
 */
export async function parserFor(householdId: string): Promise<ReminderParser> {
  const verdict = await throttleReminderParse(householdId);
  return verdict.ok ? new ReminderParser() : new ReminderParser({ client: null });
}
