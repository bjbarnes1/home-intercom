import { prisma } from "@/lib/prisma";
import type { Device } from "@prisma/client";

/**
 * MVP auth surface.
 *
 * Endpoints authenticate with their long-lived `x-device-secret` header
 * (issued at pairing). Human/controller auth (Auth.js / Lucia) is the one
 * remaining Phase-0 item — until it lands, controller requests resolve to the
 * single household. This module is the choke point to swap in real sessions.
 */

export async function currentHouseholdId(): Promise<string> {
  const household = await prisma.household.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!household) {
    throw new Error("No household configured — run `npm run prisma:seed`.");
  }
  return household.id;
}

/** Resolve and authenticate an endpoint from its device secret header. */
export async function deviceFromRequest(req: Request): Promise<Device | null> {
  const secret = req.headers.get("x-device-secret");
  if (!secret) return null;
  return prisma.device.findUnique({ where: { deviceSecret: secret } });
}
