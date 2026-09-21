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

/** A finite number, or the fallback — an unparseable coordinate is not a location. */
function numeric(value: string | undefined, fallback: number): number {
  const parsed = Number(str(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Treat empty/whitespace env vars as unset (Vercel can store empty strings). */
function str(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
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
    url: str(process.env.LIVEKIT_URL) ?? "ws://localhost:7880",
    /** Browser-facing URL (may differ behind a tunnel). Empty NEXT_PUBLIC value
     *  falls back to LIVEKIT_URL rather than becoming an empty string. */
    publicUrl:
      str(process.env.NEXT_PUBLIC_LIVEKIT_URL) ??
      str(process.env.LIVEKIT_URL) ??
      "ws://localhost:7880",
    apiKey: str(process.env.LIVEKIT_API_KEY) ?? "devkey",
    apiSecret: str(process.env.LIVEKIT_API_SECRET) ?? "devsecret",
  },

  push: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  },

  weather: {
    /** Home location for the Hub's weather. Sydney until someone says otherwise. */
    latitude: numeric(process.env.WEATHER_LATITUDE, -33.8688),
    longitude: numeric(process.env.WEATHER_LONGITUDE, 151.2093),
    place: str(process.env.WEATHER_PLACE) ?? "Sydney",
  },

  appleMusic: {
    /** Apple Developer team ID that owns the MusicKit identifier. */
    teamId: str(process.env.APPLE_MUSIC_TEAM_ID) ?? "",
    /** Key ID of the MusicKit private key (.p8). */
    keyId: str(process.env.APPLE_MUSIC_KEY_ID) ?? "",
    /** The .p8 contents, PKCS#8 PEM. Newlines may be escaped as \n. */
    privateKey: process.env.APPLE_MUSIC_PRIVATE_KEY ?? "",
  },

  tts: {
    /** OpenAI API key for Ash neural announce (gpt-4o-mini-tts). */
    openaiKey: process.env.OPENAI_API_KEY ?? "",
    /** Legacy local Piper endpoint — optional offline path. */
    piperUrl: process.env.PIPER_TTS_URL ?? "",
  },
} as const;

export type Env = typeof env;
