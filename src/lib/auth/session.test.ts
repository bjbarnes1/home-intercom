import { describe, it, expect } from "vitest";
import { hashToken, generateSessionToken } from "./session";

describe("session token", () => {
  it("hashes a token to a 64-char hex sha256 digest", () => {
    const h = hashToken("hello");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Known sha256("hello").
    expect(h).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("is deterministic for the same input", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("differs for different inputs", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("generates unguessable, unique tokens", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSessionToken()));
    expect(tokens.size).toBe(500);
    for (const t of tokens) {
      // 32 bytes base64url ~ 43 chars, url-safe alphabet only.
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(t.length).toBeGreaterThanOrEqual(43);
    }
  });
});
