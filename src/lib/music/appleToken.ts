import { createPrivateKey, sign } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Apple Music developer token.
 *
 * MusicKit authenticates the *app* with an ES256 JWT signed by the MusicKit
 * private key from the Apple Developer portal, and authenticates the *listener*
 * separately with a Music User Token the browser obtains by calling
 * `authorize()`. This module only mints the first one; it never sees the second,
 * which is the property that keeps a household's Apple Music account out of our
 * database entirely.
 *
 * The signing key is a P-256 private key in PKCS#8 PEM (the .p8 Apple hands
 * you). It never leaves the server.
 *
 * Apple caps developer tokens at six months. We mint for twelve hours and cache,
 * so a leaked token from a client is short-lived and a key rotation takes effect
 * within the day.
 */

const TTL_SECONDS = 12 * 60 * 60;
/** Re-mint a little early so a token never expires mid-request. */
const REFRESH_MARGIN_SECONDS = 10 * 60;

let cached: { token: string; expiresAt: number } | null = null;

export class AppleMusicNotConfiguredError extends Error {
  constructor() {
    super("Apple Music is not configured");
    this.name = "AppleMusicNotConfiguredError";
  }
}

/** True when all three credentials are present, so callers can degrade quietly. */
export function appleMusicConfigured(): boolean {
  const { teamId, keyId, privateKey } = env.appleMusic;
  return Boolean(teamId && keyId && privateKey);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Environment variables cannot hold real newlines on most hosts, so the key is
 * stored with literal "\n" and restored here.
 */
export function normalisePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/** Mint (or reuse) a developer token. Throws when the credentials are absent. */
export function getDeveloperToken(now = Date.now()): { token: string; expiresAt: number } {
  if (cached && cached.expiresAt - REFRESH_MARGIN_SECONDS * 1000 > now) return cached;

  const { teamId, keyId, privateKey } = env.appleMusic;
  if (!teamId || !keyId || !privateKey) throw new AppleMusicNotConfiguredError();

  const issuedAt = Math.floor(now / 1000);
  const expires = issuedAt + TTL_SECONDS;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iss: teamId, iat: issuedAt, exp: expires }));
  const signingInput = `${header}.${payload}`;

  const key = createPrivateKey(normalisePrivateKey(privateKey));
  // JOSE wants the raw r||s pair, not the ASN.1 DER sequence OpenSSL emits by
  // default — without this Apple rejects every token as malformed.
  const signature = sign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363",
  });

  cached = { token: `${signingInput}.${base64url(signature)}`, expiresAt: expires * 1000 };
  return cached;
}

/** Test seam: forget the cached token so a fresh one is minted. */
export function resetDeveloperTokenCache(): void {
  cached = null;
}
