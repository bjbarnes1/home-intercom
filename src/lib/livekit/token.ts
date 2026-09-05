import { AccessToken, type VideoGrant } from "livekit-server-sdk";
import { env } from "@/lib/env";

/**
 * What a participant is allowed to do in a room. Least privilege by intent:
 *
 *   lobby   — presence + control data only, no media (canPublish=false).
 *   talk    — publishes audio, e.g. the parent paging a child.
 *   listen  — subscribe-only, e.g. an endpoint receiving a page or broadcast.
 *   duplex  — publish + subscribe, e.g. a two-way call.
 *
 * Every role may publish/receive data messages so acks and control still work.
 */
export type Role = "lobby" | "talk" | "listen" | "duplex";

export interface TokenRequest {
  /** Stable participant identity (deviceId for endpoints, userId for people). */
  identity: string;
  /** Human-friendly name shown in participant lists. */
  name?: string;
  /** Room to scope the token to. */
  room: string;
  role: Role;
  /** Token lifetime; short by default so a leaked token expires fast. */
  ttlSeconds?: number;
}

const DEFAULT_TTL_SECONDS = 60 * 10; // 10 minutes

/**
 * Build the LiveKit VideoGrant for a role. Pure and deterministic so it can be
 * unit-tested without signing.
 */
export function grantForRole(room: string, role: Role): VideoGrant {
  const base: VideoGrant = {
    room,
    roomJoin: true,
    canPublishData: true,
    canSubscribe: true,
    canPublish: false,
  };

  switch (role) {
    case "lobby":
      return { ...base, canSubscribe: true, canPublish: false };
    case "listen":
      return { ...base, canPublish: false };
    case "talk":
    case "duplex":
      return { ...base, canPublish: true };
  }
}

/**
 * Mint a signed JWT for a participant. In MOCK_LOCAL_SERVICES mode we still
 * sign with the dev key so the shape is identical; the client just points at a
 * fake/absent server.
 */
export async function mintToken(req: TokenRequest): Promise<string> {
  const at = new AccessToken(env.livekit.apiKey, env.livekit.apiSecret, {
    identity: req.identity,
    name: req.name,
    ttl: req.ttlSeconds ?? DEFAULT_TTL_SECONDS,
  });
  at.addGrant(grantForRole(req.room, req.role));
  return at.toJwt();
}
