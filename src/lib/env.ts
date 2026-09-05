/**
 * Central, typed access to environment configuration.
 *
 * Keeping this in one module gives us a single place to reason about which
 * values are required, and the `mockLocalServices` flag that lets the whole
 * app run on a laptop with no LiveKit / Postgres / TTS behind it.
 */

function bool(value: string | undefined, fallback = false): boolean {
  if (value == null || value === "") return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export const env = {
  /**
   * When true, cloud/home-server integrations (LiveKit token signing against a
   * real server, Piper TTS, web push) are faked so the app boots standalone.
   * Real unit tests of pure logic do not depend on this.
   */
  mockLocalServices: bool(process.env.MOCK_LOCAL_SERVICES, false),

  livekit: {
    /** Server-side URL used by the backend SDK. */
    url: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
    /** Browser-facing URL (may differ behind a tunnel). */
    publicUrl:
      process.env.NEXT_PUBLIC_LIVEKIT_URL ??
      process.env.LIVEKIT_URL ??
      "ws://localhost:7880",
    apiKey: process.env.LIVEKIT_API_KEY ?? "devkey",
    apiSecret: process.env.LIVEKIT_API_SECRET ?? "devsecret",
  },

  push: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  },

  tts: {
    piperUrl: process.env.PIPER_TTS_URL ?? "",
  },
} as const;

export type Env = typeof env;
