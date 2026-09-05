import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { Device, User } from "@prisma/client";
import { SESSION_COOKIE, validateSessionToken } from "@/lib/auth/session";

/**
 * Auth surface.
 *
 * Humans (controllers/admins) authenticate with an email + password login that
 * mints a database-backed session cookie. Endpoints authenticate with their
 * long-lived `x-device-secret` header (issued at pairing). This module is the
 * single choke point — swap in OAuth here later without touching route logic.
 */

/** Thrown by require* helpers; routes map it to a 401. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** The signed-in user for the current request, or null. */
export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return validateSessionToken(token);
}

/** Require a signed-in user or throw UnauthorizedError. */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

/** Require an ADMIN (parent) user or throw. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new UnauthorizedError("Admin required");
  return user;
}

/** The signed-in user's household id (throws if not signed in). */
export async function currentHouseholdId(): Promise<string> {
  const user = await requireUser();
  return user.householdId;
}

/** Resolve and authenticate an endpoint from its device secret header. */
export async function deviceFromRequest(req: Request): Promise<Device | null> {
  const secret = req.headers.get("x-device-secret");
  if (!secret) return null;
  return prisma.device.findUnique({ where: { deviceSecret: secret } });
}
