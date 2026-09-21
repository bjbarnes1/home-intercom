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

/** The key is present but OpenSSL cannot read it — almost always how it was pasted. */
export class AppleMusicKeyError extends Error {
  constructor(detail: string) {
    super(`The MusicKit private key could not be read: ${detail}`);
    this.name = "AppleMusicKeyError";
  }
}

const PEM_LABEL = /-----(?:BEGIN|END) ([A-Z ]+?)-----/;
const ARMOUR = /-----(?:BEGIN|END) [A-Z ]+-----/g;

/**
 * Rebuild a usable PEM from however the key was pasted.
 *
 * A .p8 only survives a dashboard env-var field intact if nothing touches its
 * newlines, and something usually does. Real newlines become literal "\n", or
 * spaces, or vanish; the value arrives wrapped in quotes it was copied with, or
 * base64-encoded whole, or as the body with the BEGIN/END lines left behind.
 * OpenSSL rejects every one of those with the same opaque
 * "DECODER routines::unsupported", which says nothing about which mistake it was.
 *
 * So rather than trusting the layout, take the base64 body and re-emit the PEM
 * the way OpenSSL wants it: armour on its own lines, body wrapped at 64
 * characters. The label is kept when there is one, because a SEC1 "EC PRIVATE
 * KEY" and a PKCS#8 "PRIVATE KEY" decode differently and Apple issues the latter.
 */
export function normalisePrivateKey(raw: string): string {
  let text = raw.trim();
  if (!text) throw new AppleMusicKeyError("it is empty");

  // Copied with its surrounding quotes.
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }

  // Stored with escaped newlines rather than real ones.
  text = text.replace(/\\r/g, "").replace(/\\n/g, "\n");

  // Base64 of the whole file, which some hosts suggest to dodge the newline problem.
  if (!text.includes("-----") && looksBase64(text)) {
    const decoded = safeDecode(text);
    if (decoded.includes("-----")) text = decoded.trim();
  }

  const label = text.match(PEM_LABEL)?.[1] ?? "PRIVATE KEY";
  const body = text.replace(ARMOUR, "").replace(/\s/g, "");

  if (!body) throw new AppleMusicKeyError("it contains no key data");
  if (!looksBase64(body)) throw new AppleMusicKeyError("it is not valid base64");

  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function looksBase64(text: string): boolean {
  return /^[A-Za-z0-9+/=\s]+$/.test(text) && text.replace(/[^A-Za-z0-9+/=]/g, "").length > 0;
}

function safeDecode(text: string): string {
  try {
    return Buffer.from(text, "base64").toString("utf8");
  } catch {
    return "";
  }
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

  let key;
  try {
    key = createPrivateKey(normalisePrivateKey(privateKey));
  } catch (e) {
    if (e instanceof AppleMusicKeyError) throw e;
    // OpenSSL's own message names no cause, so say what is actually actionable.
    throw new AppleMusicKeyError(
      "it is not a P-256 private key in PKCS#8 form. Paste the whole .p8 file, " +
        "BEGIN and END lines included.",
    );
  }
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
