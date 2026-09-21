import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { reportWarning } from "@/lib/errors/report";

/**
 * Throttles for the two unauthenticated doors into the system: signing in, and
 * claiming a pairing code.
 *
 * Backed by Upstash over its REST API rather than an in-process counter,
 * because on serverless a counter in module scope is per-instance: it resets
 * on every cold start and each concurrent lambda gets its own, so it stops
 * roughly nobody. The state has to live outside the function.
 *
 * FAILS OPEN, deliberately. If Upstash is unreachable, everyone being unable
 * to sign in is a worse outcome than the guessing this is meant to slow down —
 * and an outage at the limiter would otherwise take the whole product with it.
 * A failure is reported so it is visible rather than silent.
 */

/**
 * Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash account
 * gives you UPSTASH_REDIS_REST_*. Accept either so whichever was set up works
 * without anyone having to rename a variable.
 */
function credentials(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? { url, token } : null;
}

let limiters: {
  loginByIp: Ratelimit;
  loginByAccount: Ratelimit;
  claimByIp: Ratelimit;
} | null = null;
let warnedUnconfigured = false;

function build() {
  if (limiters) return limiters;
  const creds = credentials();
  if (!creds) {
    if (!warnedUnconfigured && process.env.NODE_ENV === "production") {
      warnedUnconfigured = true;
      reportWarning(new Error("Upstash is not configured; throttles are off"), {
        code: "ratelimit.unconfigured",
        route: "lib/ratelimit",
      });
    }
    return null;
  }
  const redis = new Redis(creds);
  limiters = {
    /*
     * Per IP: a burst is normal (someone fat-fingers a password twice), a
     * hundred an hour is not. Sliding window rather than fixed, so an attacker
     * cannot get two full buckets by straddling a boundary.
     */
    loginByIp: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "10 m"),
      prefix: "rl:login:ip",
      analytics: false,
    }),
    /*
     * Per account, independently: an attacker spraying one password across a
     * botnet hits no single IP limit, but every attempt lands on the same
     * email. Tighter, because a real person does not need ten tries.
     */
    loginByAccount: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "10 m"),
      prefix: "rl:login:acct",
      analytics: false,
    }),
    /*
     * Pairing codes are six characters from a 32-character alphabet and live
     * for fifteen minutes. That is a large space, but not one worth letting
     * anybody walk: at ten tries a minute it would take longer than the code
     * lives, by a lot.
     */
    claimByIp: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "rl:claim:ip",
      analytics: false,
    }),
  };
  return limiters;
}

/** Best-effort client IP. Vercel sets x-forwarded-for; first hop is the client. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export interface ThrottleVerdict {
  /** False when the caller has spent its allowance. */
  ok: boolean;
  /** Seconds until the next attempt is allowed. Only meaningful when !ok. */
  retryAfterSec: number;
}

const ALLOWED: ThrottleVerdict = { ok: true, retryAfterSec: 0 };

async function consume(
  which: "loginByIp" | "loginByAccount" | "claimByIp",
  key: string,
): Promise<ThrottleVerdict> {
  const built = build();
  if (!built) return ALLOWED;
  try {
    const { success, reset } = await built[which].limit(key);
    if (success) return ALLOWED;
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch (e) {
    // Fail open — see the note at the top of the file.
    reportWarning(e, { code: "ratelimit.unavailable", route: which });
    return ALLOWED;
  }
}

/** Throttle a sign-in attempt by source IP and by the account being targeted. */
export async function throttleLogin(
  ip: string,
  email: string,
): Promise<ThrottleVerdict> {
  const [byIp, byAccount] = await Promise.all([
    consume("loginByIp", ip),
    consume("loginByAccount", email.toLowerCase()),
  ]);
  // Whichever bucket is emptier decides, and the longer wait wins.
  if (byIp.ok && byAccount.ok) return ALLOWED;
  return {
    ok: false,
    retryAfterSec: Math.max(byIp.retryAfterSec, byAccount.retryAfterSec),
  };
}

/** Throttle a pairing-code claim by source IP. */
export async function throttleClaim(ip: string): Promise<ThrottleVerdict> {
  return consume("claimByIp", ip);
}

/** 429 with a Retry-After header, which is what a well-behaved client reads. */
export function tooManyRequests(verdict: ThrottleVerdict, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(verdict.retryAfterSec),
    },
  });
}
