import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

/**
 * Database-backed sessions. The cookie carries an opaque random token; the DB
 * stores only its SHA-256 hash, so a database dump cannot be used to forge
 * live sessions.
 */

export const SESSION_COOKIE = "intercom_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Slide the expiry forward when a session is used within this window of expiry.
const RENEW_WITHIN_MS = 15 * 24 * 60 * 60 * 1000;

/** Hash a raw token to its storage id. Pure — unit-testable. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { id: hashToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function validateSessionToken(
  rawToken: string | undefined | null,
): Promise<User | null> {
  if (!rawToken) return null;
  const id = hashToken(rawToken);
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }

  // Sliding expiry: extend when close to the end so active users stay signed in.
  if (session.expiresAt.getTime() - now < RENEW_WITHIN_MS) {
    await prisma.session.update({
      where: { id },
      data: { expiresAt: new Date(now + SESSION_TTL_MS) },
    });
  }

  return session.user;
}

export async function invalidateSession(rawToken: string | undefined | null): Promise<void> {
  if (!rawToken) return;
  await prisma.session.delete({ where: { id: hashToken(rawToken) } }).catch(() => {});
}
