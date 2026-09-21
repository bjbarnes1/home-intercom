import { Redis } from "@upstash/redis";

/**
 * The one Redis client.
 *
 * Redis holds the state that is hot, ephemeral and read-once — liveness, the
 * device-auth cache, rate-limit counters. Postgres holds what a household
 * would be upset to lose. Keeping that line sharp is the point: presence was
 * in Postgres, and two panels heartbeating every ten seconds were enough to
 * keep a billed compute instance awake around the clock.
 *
 * Nothing here is required for the app to boot. Every caller has a defined
 * behaviour when Redis is absent or unreachable, chosen per call site rather
 * than globally — see each module's note on which way it fails.
 */

/**
 * Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash account
 * gives you UPSTASH_REDIS_REST_*. Accept either, so whichever was set up works
 * without anyone having to rename a variable.
 */
function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

let client: Redis | null = null;
let resolved = false;

/** The shared client, or null when Redis is not configured. */
export function redis(): Redis | null {
  if (resolved) return client;
  resolved = true;
  const creds = credentials();
  client = creds ? new Redis(creds) : null;
  return client;
}

/** Whether Redis is configured. Cheap; does not open a connection. */
export function hasRedis(): boolean {
  return redis() !== null;
}

/** Test seam: forget the resolved client so env changes take effect. */
export function resetRedisForTests(): void {
  client = null;
  resolved = false;
}
