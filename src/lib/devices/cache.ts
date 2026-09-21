import { createHash } from "node:crypto";
import type { Device } from "@prisma/client";
import { redis } from "@/lib/redis";
import { reportWarning } from "@/lib/errors/report";

/**
 * The device row a panel authenticates as, cached.
 *
 * Every device-authenticated request looked this up by secret, so a heartbeat
 * cost a Postgres read before it did anything else. The row is also the
 * panel's settings — room, DND, quiet hours, chime, dwell — so caching it
 * removes the settings read on the same request.
 *
 * FAILS CLOSED in one direction that matters: a cache miss or an unreachable
 * Redis falls through to Postgres, so the worst case is the load we had
 * before. It never invents a device.
 *
 * The key is a SHA-256 of the secret, never the secret. A Redis keyspace is
 * visible to anything that can reach the instance and turns up in logs, slow
 * queries and dashboards; a device secret is a bearer credential with no
 * expiry, and there is no reason for it to be in any of those.
 */

/**
 * Short, because it is the blast radius of a revoked secret that was not
 * explicitly invalidated. Revocation does invalidate (see forgetSecret), so
 * this only covers a path that forgot to — a minute of exposure, not an hour.
 */
const TTL_MS = 60_000;

const keyFor = (secret: string) =>
  `devauth:${createHash("sha256").update(secret).digest("hex")}`;

/*
 * Dates do not survive JSON, so they are revived explicitly on the way out.
 *
 * The first cut dropped them instead, which was wrong in a way types could not
 * catch: /api/music/fetch reads `musicLinkedAt` straight off the authenticated
 * device, so a cache hit would have made it undefined and that route would have
 * told every panel to sign in to Apple Music, forever. A cached row has to be
 * a faithful Device or the cast at the call site is a lie.
 */
const DATE_FIELDS = [
  "lastSeenAt",
  "createdAt",
  "updatedAt",
  "nowPlayingAt",
  "musicLinkedAt",
] as const;

type Serialized = Record<string, unknown>;

function revive(raw: Serialized): Device {
  const out: Serialized = { ...raw };
  for (const field of DATE_FIELDS) {
    const v = out[field];
    out[field] = typeof v === "string" ? new Date(v) : (v ?? null);
  }
  return out as unknown as Device;
}

/**
 * Look up a cached device by its secret.
 *
 * Returns null on a miss, on any Redis trouble, and when Redis is not
 * configured — the caller reads Postgres in all three cases.
 */
export async function cachedBySecret(secret: string): Promise<Device | null> {
  const r = redis();
  if (!r) return null;
  try {
    const raw = await r.get<Serialized>(keyFor(secret));
    return raw ? revive(raw) : null;
  } catch (e) {
    reportWarning(e, { code: "devauth.read", route: "devices/cache" });
    return null;
  }
}

/** Remember a device row against its secret. */
export async function rememberSecret(
  secret: string,
  device: Device,
): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.set(keyFor(secret), device, { px: TTL_MS });
  } catch (e) {
    reportWarning(e, { code: "devauth.write", route: "devices/cache" });
  }
}

/**
 * Drop a cached secret. Called when a device is recoded, so the old phone
 * stops working the moment a parent revokes it rather than up to TTL_MS later.
 */
export async function forgetSecret(secret: string): Promise<void> {
  const r = redis();
  if (!r) return;
  try {
    await r.del(keyFor(secret));
  } catch (e) {
    // Worth an alarm rather than a shrug: this is the revocation path, and the
    // fallback is that a revoked secret keeps working until the TTL expires.
    reportWarning(e, { code: "devauth.revoke", route: "devices/cache" });
  }
}

/**
 * Drop a cached row whose settings just changed, so the panel's next heartbeat
 * reads the new value rather than serving the old one for up to TTL_MS.
 * Takes the secret because that is what the cache is keyed on.
 */
export const invalidateSecret = forgetSecret;
