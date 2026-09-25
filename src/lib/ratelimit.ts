import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "@/lib/redis";
import { reportWarning } from "@/lib/errors/report";

/**
 * Throttles for the unauthenticated doors into the system: signing in,
 * claiming a pairing code, and looking up weather for anywhere but home.
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

let limiters: {
  loginByIp: Ratelimit;
  loginByAccount: Ratelimit;
  claimByIp: Ratelimit;
  weatherByIp: Ratelimit;
  reminderParseByHousehold: Ratelimit;
} | null = null;
let warnedUnconfigured = false;

function build() {
  if (limiters) return limiters;
  const r = redis();
  if (!r) {
    if (!warnedUnconfigured && process.env.NODE_ENV === "production") {
      warnedUnconfigured = true;
      reportWarning(new Error("Upstash is not configured; throttles are off"), {
        code: "ratelimit.unconfigured",
        route: "lib/ratelimit",
      });
    }
    return null;
  }
  limiters = {
    /*
     * Per IP: a burst is normal (someone fat-fingers a password twice), a
     * hundred an hour is not. Sliding window rather than fixed, so an attacker
     * cannot get two full buckets by straddling a boundary.
     */
    loginByIp: new Ratelimit({
      redis: r,
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
      redis: r,
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
      redis: r,
      limiter: Ratelimit.slidingWindow(10, "1 m"),
      prefix: "rl:claim:ip",
      analytics: false,
    }),
    /*
     * Forecasts for somewhere other than home, and place searches. Open
     * because the Hub has nobody signed in, so this is what stops an anonymous
     * loop fanning out to Open-Meteo through us — the in-process forecast
     * cache is per-instance and cannot. Generous, because every panel and
     * phone in a house shares one public IP; a family searching and flicking
     * between places does not come close.
     */
    weatherByIp: new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(120, "10 m"),
      prefix: "rl:weather:ip",
      analytics: false,
    }),
    /*
     * Natural-language reminder parsing costs a model call each time and the
     * Hub has nobody signed in, so a stuck button or a script holding a device
     * secret could run up a bill. Per household, because that is who pays.
     * Thirty in ten minutes is several times what a family dictating reminders
     * in a burst actually does; past it the panel still works, on the offline
     * parser.
     */
    reminderParseByHousehold: new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(30, "10 m"),
      prefix: "rl:reminder-parse:hh",
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
  which: "loginByIp" | "loginByAccount" | "claimByIp" | "weatherByIp" | "reminderParseByHousehold",
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

/** Throttle a weather lookup that is not for home, by source IP. */
export async function throttleWeather(ip: string): Promise<ThrottleVerdict> {
  return consume("weatherByIp", ip);
}

/** Throttle AI reminder parsing, per household. */
export async function throttleReminderParse(householdId: string): Promise<ThrottleVerdict> {
  return consume("reminderParseByHousehold", householdId);
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
