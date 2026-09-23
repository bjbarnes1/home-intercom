import { describe, expect, it } from "vitest";
import {
  describeMusicKitError,
  isSkippable,
  musicKitErrorCode,
  type MusicErrorKind,
} from "@/lib/music/errors";

/** Stands in for MusicKit v3's MKError, whose `errorCode` is a getter over `reason`. */
class FakeMKError extends Error {
  constructor(private readonly reason: string, message = "") {
    super(message);
  }
  get errorCode() {
    return this.reason;
  }
}

describe("musicKitErrorCode", () => {
  it("reads the v3 errorCode getter", () => {
    expect(musicKitErrorCode(new FakeMKError("GEO_BLOCK"))).toBe("GEO_BLOCK");
  });

  it("falls back to reason when the prototype is gone", () => {
    expect(musicKitErrorCode({ reason: "AGE_GATE" })).toBe("AGE_GATE");
  });

  it("ignores anything that is not a string", () => {
    expect(musicKitErrorCode({ errorCode: 42, reason: "NOT_FOUND" })).toBe("NOT_FOUND");
    expect(musicKitErrorCode({ errorCode: {} })).toBe("");
    expect(musicKitErrorCode(new Error("x"))).toBe("");
    expect(musicKitErrorCode("NETWORK_ERROR")).toBe("");
    expect(musicKitErrorCode(null)).toBe("");
    expect(musicKitErrorCode(undefined)).toBe("");
  });
});

describe("describeMusicKitError", () => {
  const cases: [string, MusicErrorKind, string][] = [
    ["SUBSCRIPTION_ERROR", "subscription", "This Apple ID doesn't have an Apple Music subscription."],
    ["STREAM_UPSELL", "subscription", "This Apple ID doesn't have an Apple Music subscription."],
    ["AUTHORIZATION_ERROR", "auth", "Apple Music needs you to sign in again."],
    ["UNAUTHORIZED_ERROR", "auth", "Apple Music needs you to sign in again."],
    ["TOKEN_EXPIRED", "auth", "Apple Music needs you to sign in again."],
    ["ACCESS_DENIED", "auth", "Apple Music needs you to sign in again."],
    ["CONTENT_UNAVAILABLE", "unavailable", "That isn't available on Apple Music here."],
    ["NOT_FOUND", "unavailable", "That isn't available on Apple Music here."],
    ["CONTENT_UNSUPPORTED", "unavailable", "That isn't available on Apple Music here."],
    ["GEO_BLOCK", "unavailable", "That isn't available on Apple Music here."],
    ["CONTENT_RESTRICTED", "restricted", "That's restricted on this Apple ID."],
    ["AGE_GATE", "restricted", "That's restricted on this Apple ID."],
    ["NETWORK_ERROR", "network", "Apple Music can't be reached right now."],
    ["BUFFER_STALLED_ERROR", "network", "Apple Music can't be reached right now."],
    ["SERVICE_UNAVAILABLE", "network", "Apple Music can't be reached right now."],
    ["SERVER_ERROR", "network", "Apple Music can't be reached right now."],
    ["DEVICE_LIMIT", "device-limit", "This Apple ID is already playing on another device."],
  ];

  it.each(cases)("%s is %s", (code, kind, message) => {
    expect(describeMusicKitError(new FakeMKError(code, "developer wording"))).toEqual({ kind, message, code });
  });

  it("maps an object that only has a reason", () => {
    expect(describeMusicKitError({ reason: "CONTENT_RESTRICTED" })).toEqual({
      kind: "restricted",
      message: "That's restricted on this Apple ID.",
      code: "CONTENT_RESTRICTED",
    });
  });

  it("keeps the message of an unknown MusicKit error", () => {
    expect(describeMusicKitError(new FakeMKError("QUOTA_EXCEEDED", "Too many requests"))).toEqual({
      kind: "other",
      message: "Too many requests",
      code: "QUOTA_EXCEEDED",
    });
  });

  it("keeps a plain Error's message", () => {
    expect(describeMusicKitError(new Error("Something specific"))).toEqual({
      kind: "other",
      message: "Something specific",
      code: "",
    });
  });

  it("falls back when there is nothing worth showing", () => {
    expect(describeMusicKitError(new FakeMKError("UNKNOWN_ERROR")).message).toBe("Apple Music couldn't play that");
    expect(describeMusicKitError(new Error("  ")).message).toBe("Apple Music couldn't play that");
    expect(describeMusicKitError("boom")).toEqual({ kind: "other", message: "Apple Music couldn't play that", code: "" });
    expect(describeMusicKitError(undefined).kind).toBe("other");
    expect(describeMusicKitError(null, "Couldn't start that").message).toBe("Couldn't start that");
    expect(describeMusicKitError(42).code).toBe("");
  });

  it("never blames Apple Music by possessive", () => {
    for (const [code] of cases) {
      expect(describeMusicKitError({ reason: code }).message).not.toMatch(/Apple Music's/);
    }
  });
});

describe("isSkippable", () => {
  it("skips a single track that cannot play here, and stops for everything else", () => {
    expect(isSkippable("unavailable")).toBe(true);
    expect(isSkippable("restricted")).toBe(true);
    for (const kind of ["subscription", "auth", "network", "device-limit", "other"] as const) {
      expect(isSkippable(kind)).toBe(false);
    }
  });
});
