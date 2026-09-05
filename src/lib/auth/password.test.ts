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
