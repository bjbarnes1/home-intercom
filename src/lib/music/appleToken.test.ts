import { generateKeyPairSync, createPublicKey, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The token is only useful if Apple can verify it, so these tests verify the
 * signature the same way Apple does rather than asserting on the string shape.
 */

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function decode(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
}

async function load(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  return import("@/lib/music/appleToken");
}

const good = {
  APPLE_MUSIC_TEAM_ID: "TEAM123456",
  APPLE_MUSIC_KEY_ID: "KEY1234567",
  APPLE_MUSIC_PRIVATE_KEY: privateKey,
};

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe("getDeveloperToken", () => {
  it("mints a token Apple's public key can verify", async () => {
    const { getDeveloperToken } = await load(good);
    const { token } = getDeveloperToken();

    const [header, payload, signature] = token.split(".");
    expect(header && payload && signature).toBeTruthy();

    const ok = verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: createPublicKey(publicKey), dsaEncoding: "ieee-p1363" },
      Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
    );
    expect(ok).toBe(true);
  });

  it("names the key in the header and the team in the payload", async () => {
    const { getDeveloperToken } = await load(good);
    const [header, payload] = getDeveloperToken().token.split(".");

    expect(decode(header)).toMatchObject({ alg: "ES256", kid: "KEY1234567", typ: "JWT" });
    expect(decode(payload)).toMatchObject({ iss: "TEAM123456" });
  });

  it("expires within Apple's six-month ceiling", async () => {
    const { getDeveloperToken } = await load(good);
    const payload = decode(getDeveloperToken().token.split(".")[1]);
    const life = (payload.exp as number) - (payload.iat as number);

    expect(life).toBeGreaterThan(0);
    expect(life).toBeLessThanOrEqual(15_777_000);
  });

  it("reuses a live token and re-mints once it is near expiry", async () => {
    const { getDeveloperToken } = await load(good);
    const first = getDeveloperToken(1_000_000_000_000);
    expect(getDeveloperToken(1_000_000_000_000).token).toBe(first.token);

    // Eleven hours on, the cached token is inside the refresh margin.
    const later = getDeveloperToken(1_000_000_000_000 + 11.99 * 60 * 60 * 1000);
    expect(later.token).not.toBe(first.token);
  });

  /**
   * Every one of these is a real way a .p8 comes back out of a dashboard
   * env-var field, and every one of them makes OpenSSL throw the same opaque
   * ERR_OSSL_UNSUPPORTED. They must all still mint a token.
   */
  it.each([
    ["escaped newlines", (k: string) => k.replace(/\n/g, "\\n")],
    ["newlines turned into spaces", (k: string) => k.replace(/\n/g, " ")],
    ["newlines stripped entirely", (k: string) => k.replace(/\n/g, "")],
    ["CRLF line endings", (k: string) => k.replace(/\n/g, "\r\n")],
    ["wrapped in the quotes it was copied with", (k: string) => `"${k}"`],
    ["leading and trailing whitespace", (k: string) => `\n  ${k}  \n`],
    ["base64 of the whole file", (k: string) => Buffer.from(k).toString("base64")],
    ["the body with the BEGIN/END lines lost", (k: string) =>
      k.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")],
  ])("survives a key with %s", async (_name, mangle) => {
    const { getDeveloperToken } = await load({
      ...good,
      APPLE_MUSIC_PRIVATE_KEY: mangle(privateKey),
    });
    const [header, payload, signature] = getDeveloperToken().token.split(".");
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: createPublicKey(publicKey), dsaEncoding: "ieee-p1363" },
        Buffer.from(signature.replace(/-/g, "+").replace(/_/g, "/"), "base64"),
      ),
    ).toBe(true);
  });

  it("names the problem when the key is not a key at all", async () => {
    const { getDeveloperToken, AppleMusicKeyError } = await load({
      ...good,
      APPLE_MUSIC_PRIVATE_KEY: "not-a-key",
    });
    expect(() => getDeveloperToken()).toThrow(AppleMusicKeyError);
  });

  it("does not put key material in the error", async () => {
    const { getDeveloperToken } = await load({
      ...good,
      APPLE_MUSIC_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\nc2VjcmV0LW1hdGVyaWFs\n-----END PRIVATE KEY-----`,
    });
    try {
      getDeveloperToken();
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).not.toContain("c2VjcmV0");
    }
  });

  it("refuses to pretend when a credential is missing", async () => {
    const { getDeveloperToken, appleMusicConfigured, AppleMusicNotConfiguredError } = await load({
      ...good,
      APPLE_MUSIC_KEY_ID: undefined,
    });
    expect(appleMusicConfigured()).toBe(false);
    expect(() => getDeveloperToken()).toThrow(AppleMusicNotConfiguredError);
  });

  it("reports itself configured when all three are present", async () => {
    const { appleMusicConfigured } = await load(good);
    expect(appleMusicConfigured()).toBe(true);
  });
});
