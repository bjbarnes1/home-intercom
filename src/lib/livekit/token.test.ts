import { describe, it, expect } from "vitest";
import { grantForRole, mintToken } from "./token";

describe("grantForRole", () => {
  it("lobby: presence + data only, no media publish", () => {
    const g = grantForRole("lobby", "lobby");
    expect(g.roomJoin).toBe(true);
    expect(g.canPublish).toBe(false);
    expect(g.canSubscribe).toBe(true);
    expect(g.canPublishData).toBe(true);
  });

  it("listen: subscribe-only receiver cannot publish audio", () => {
    const g = grantForRole("broadcast:z1", "listen");
    expect(g.canPublish).toBe(false);
    expect(g.canSubscribe).toBe(true);
  });

  it("talk: page initiator may publish", () => {
    const g = grantForRole("page:d1", "talk");
    expect(g.canPublish).toBe(true);
    expect(g.canSubscribe).toBe(true);
  });

  it("duplex: two-way call may publish and subscribe", () => {
    const g = grantForRole("call:d1", "duplex");
    expect(g.canPublish).toBe(true);
    expect(g.canSubscribe).toBe(true);
  });

  it("scopes the grant to exactly the requested room", () => {
    expect(grantForRole("page:abc", "talk").room).toBe("page:abc");
  });
});

/** Decode a JWT payload segment without verifying the signature (test only). */
function decodePayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  const json = Buffer.from(payload, "base64url").toString("utf8");
  return JSON.parse(json);
}

describe("mintToken", () => {
  it("signs a JWT carrying the identity and scoped grant", async () => {
    const jwt = await mintToken({
      identity: "device-123",
      room: "page:device-123",
      role: "listen",
    });
    const payload = decodePayload(jwt);
    expect(payload.sub).toBe("device-123");
    const video = payload.video as Record<string, unknown>;
    expect(video.room).toBe("page:device-123");
    expect(video.canPublish).toBe(false);
    expect(video.canSubscribe).toBe(true);
  });

  it("sets an expiry (short-lived token)", async () => {
    const jwt = await mintToken({
      identity: "u1",
      room: "lobby",
      role: "lobby",
      ttlSeconds: 120,
    });
    const payload = decodePayload(jwt);
    expect(typeof payload.exp).toBe("number");
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp as number).toBeGreaterThan(now);
    expect(payload.exp as number).toBeLessThanOrEqual(now + 130);
  });
});
