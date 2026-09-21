import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong password!!", hash)).toBe(false);
  });

  it("produces a distinct salt each time (no identical hashes)", async () => {
    const a = await hashPassword("samePassword1");
    const b = await hashPassword("samePassword1");
    expect(a).not.toBe(b);
    expect(await verifyPassword("samePassword1", a)).toBe(true);
    expect(await verifyPassword("samePassword1", b)).toBe(true);
  });

  it("uses the tagged scrypt format", async () => {
    const hash = await hashPassword("anotherPassword");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.split("$")).toHaveLength(3);
  });

  it("rejects too-short passwords at hash time", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });

  it("returns false for null/garbage stored values", async () => {
    expect(await verifyPassword("whatever12", null)).toBe(false);
    expect(await verifyPassword("whatever12", "not-a-hash")).toBe(false);
    expect(await verifyPassword("whatever12", "scrypt$only$two")).toBe(false);
  });
});

describe("verifyPassword — timing", () => {
  /*
   * Not a precise benchmark — a CI box is noisy. The channel being closed is
   * the difference between ~2ms (early return, no KDF) and a real scrypt, so
   * a generous floor is enough to catch a regression that reintroduces it.
   */
  it("spends comparable work when there is no stored hash", async () => {
    const stored = await hashPassword("correct horse battery");

    const t0 = performance.now();
    await verifyPassword("wrong guess entirely", stored);
    const real = performance.now() - t0;

    const t1 = performance.now();
    await verifyPassword("wrong guess entirely", null);
    const missing = performance.now() - t1;

    expect(missing).toBeGreaterThan(real / 4);
  });

  it("spends comparable work on a malformed stored hash", async () => {
    const stored = await hashPassword("correct horse battery");

    const t0 = performance.now();
    await verifyPassword("wrong guess entirely", stored);
    const real = performance.now() - t0;

    const t1 = performance.now();
    await verifyPassword("wrong guess entirely", "not-a-scrypt-hash");
    const malformed = performance.now() - t1;

    expect(malformed).toBeGreaterThan(real / 4);
  });
});
