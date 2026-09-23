/**
 * Turning MusicKit's failures into something a family can read.
 *
 * MusicKit JS v3 throws an `MKError` whose `errorCode` getter returns a reason
 * string like `CONTENT_RESTRICTED` or `STREAM_UPSELL` (checked against the v3
 * bundle). Those codes are precise but mean nothing on a kitchen wall, and the
 * `message` that comes with them is often empty or written for developers. So
 * the code is sorted into a handful of kinds — each with one calm sentence —
 * and the kind, not the wording, is what the rest of the Hub decides on.
 *
 * Pure and free of browser globals, so it can be tested without MusicKit and
 * used on either side of the wire.
 */

export type MusicErrorKind =
  | "subscription"
  | "auth"
  | "unavailable"
  | "restricted"
  | "network"
  | "device-limit"
  | "other";

export interface MusicError {
  kind: MusicErrorKind;
  /** One plain sentence, fit to show as-is. */
  message: string;
  /** MusicKit's own reason string, or "" — kept for logs, never shown. */
  code: string;
}

/**
 * MusicKit's reason string for a thrown value, or "" when there is none.
 *
 * `errorCode` is the v3 getter; `reason` is the field underneath it, and is
 * what an error looks like once it has been copied, serialised or logged and
 * lost its prototype. Anything that is not a string is ignored rather than
 * guessed at.
 */
export function musicKitErrorCode(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  const { errorCode, reason } = e as { errorCode?: unknown; reason?: unknown };
  if (typeof errorCode === "string" && errorCode) return errorCode;
  if (typeof reason === "string" && reason) return reason;
  return "";
}

const MESSAGES: Record<Exclude<MusicErrorKind, "other">, string> = {
  subscription: "This Apple ID doesn't have an Apple Music subscription.",
  auth: "Apple Music needs you to sign in again.",
  unavailable: "That isn't available on Apple Music here.",
  restricted: "That's restricted on this Apple ID.",
  network: "Apple Music can't be reached right now.",
  "device-limit": "This Apple ID is already playing on another device.",
};

const KIND_BY_CODE: Record<string, Exclude<MusicErrorKind, "other">> = {
  // Upsell is how MusicKit says "subscribe to hear the whole song".
  SUBSCRIPTION_ERROR: "subscription",
  STREAM_UPSELL: "subscription",

  AUTHORIZATION_ERROR: "auth",
  UNAUTHORIZED_ERROR: "auth",
  TOKEN_EXPIRED: "auth",
  ACCESS_DENIED: "auth",

  // Not in this storefront, pulled from the catalogue, or a format this
  // browser cannot play: to a listener these are all "not here".
  CONTENT_UNAVAILABLE: "unavailable",
  NOT_FOUND: "unavailable",
  CONTENT_UNSUPPORTED: "unavailable",
  GEO_BLOCK: "unavailable",

  // Screen Time or the account's explicit-content setting said no.
  CONTENT_RESTRICTED: "restricted",
  AGE_GATE: "restricted",

  NETWORK_ERROR: "network",
  BUFFER_STALLED_ERROR: "network",
  SERVICE_UNAVAILABLE: "network",
  SERVER_ERROR: "network",

  DEVICE_LIMIT: "device-limit",
};

/**
 * Describe whatever MusicKit threw.
 *
 * Known codes get their fixed sentence. Anything else keeps the error's own
 * message when it has one — better a specific stranger than a vague friend —
 * and falls back to the caller's wording when it does not, because a thrown
 * string or `undefined` has nothing worth showing.
 */
export function describeMusicKitError(
  e: unknown,
  fallback = "Apple Music couldn't play that",
): MusicError {
  const code = musicKitErrorCode(e);
  const kind = KIND_BY_CODE[code.toUpperCase()];
  if (kind) return { kind, message: MESSAGES[kind], code };

  const message = e instanceof Error && e.message.trim() ? e.message : fallback;
  return { kind: "other", message, code };
}

/**
 * Whether the queue should move on rather than stop.
 *
 * One track that is missing here or restricted on this Apple ID says nothing
 * about the next one, so the music carries on. A lapsed subscription, a signed
 * out account or a dropped network would fail the next track the same way, so
 * those stop and say so.
 */
export function isSkippable(kind: MusicErrorKind): boolean {
  return kind === "unavailable" || kind === "restricted";
}
