import { redis } from "@/lib/redis";
import { reportWarning } from "@/lib/errors/report";

/**
 * Panel liveness.
 *
 * A heartbeat is the most write-heavy, least durable thing the system does: a
 * panel says "still here" every ten seconds, and the answer is worthless
 * twenty seconds later. It used to be an UPDATE on Device.lastSeenAt, which
 * meant two panels were enough to keep a billed Postgres compute awake around
 * the clock — the gap between writes never reached the minimum suspend window,
 * so it could never idle.
 *
 * Here it is a Redis key whose TTL *is* the presence window. Nothing expires
 * anything on a schedule and nothing sweeps: a key that exists means the panel
 * was heard from inside the window, and a key that is gone means it was not.
 *
 * FAILS OPEN — an unreachable Redis reports everyone as online, which is the
 * safe direction here for a reason worth stating. This flag is a pre-filter
 * and a UI signal; the authority on whether a page can actually be delivered
 * is LiveKit's participant list, which `ControlSender.connected()` reads
 * separately. Reporting everyone offline would silently stop every page,
 * announcement and reminder in the house. Reporting everyone online only means
 * the delivery path does the filtering it was always going to do.
 */

/** How long after a heartbeat a panel still counts as online. */
export const PRESENCE_WINDOW_MS = 20_000;

const key = (deviceId: string) => `presence:${deviceId}`;

/**
 * Dev fallback when Redis is not configured. A module-level Map is per-process
 * and therefore useless on serverless — which is exactly why presence cannot
 * live in one in production, and exactly why it is fine for `next dev`, where
 * there is one process.
 */
const local = new Map<string, number>();

/** Record that a panel is alive. Cheap enough to call on every heartbeat. */
export async function touch(
  deviceId: string,
  now: number = Date.now(),
): Promise<void> {
  const r = redis();
  if (!r) {
    local.set(key(deviceId), now);
    return;
  }
  try {
    // The TTL is the window. No sweeper, no clock comparison on read.
    await r.set(key(deviceId), now, { px: PRESENCE_WINDOW_MS });
  } catch (e) {
    reportWarning(e, { code: "presence.touch", route: "presence/store" });
  }
}

/**
 * Of the given devices, which were heard from inside the window.
 *
 * One round trip regardless of how many devices are asked about, because the
 * caller already knows the household's roster from Postgres and we only need
 * liveness for those ids — never a scan of the keyspace.
 */
export async function onlineAmong(
  deviceIds: string[],
  now: number = Date.now(),
): Promise<Set<string>> {
  if (deviceIds.length === 0) return new Set();

  const r = redis();
  if (!r) {
    const fresh = deviceIds.filter((id) => {
      const seen = local.get(key(id));
      return seen != null && now - seen <= PRESENCE_WINDOW_MS;
    });
    return new Set(fresh);
  }

  try {
    const values = await r.mget<(number | null)[]>(...deviceIds.map(key));
    const online = new Set<string>();
    deviceIds.forEach((id, i) => {
      if (values[i] != null) online.add(id);
    });
    return online;
  } catch (e) {
    // Fail open — see the note at the top of the file.
    reportWarning(e, { code: "presence.read", route: "presence/store" });
    return new Set(deviceIds);
  }
}

/** Whether one device is online. Prefer onlineAmong() for more than one. */
export async function isDeviceOnline(deviceId: string): Promise<boolean> {
  return (await onlineAmong([deviceId])).has(deviceId);
}

/** Forget a device's liveness — used when a panel is unpaired or recoded. */
export async function forget(deviceId: string): Promise<void> {
  const r = redis();
  if (!r) {
    local.delete(key(deviceId));
    return;
  }
  try {
    await r.del(key(deviceId));
  } catch (e) {
    reportWarning(e, { code: "presence.forget", route: "presence/store" });
  }
}

/** Test seam: drop the in-process fallback state. */
export function resetLocalPresenceForTests(): void {
  local.clear();
}

/*
 * Device.lastSeenAt is still written, but rarely.
 *
 * The column answers a different question from the one above: not "is this
 * panel alive right now" but "when did we last hear from it at all" — which is
 * how you find the panel in the rumpus room that has been dark since the sixth
 * of September. A 20-second Redis key cannot tell you that, and it is worth
 * knowing.
 *
 * So the write survives, throttled behind its own Redis key, at roughly one
 * per device per WRITEBACK_MS instead of six a minute.
 */

/** How often the durable "last seen" column is refreshed. */
export const WRITEBACK_MS = 5 * 60 * 1000;

const writebackKey = (deviceId: string) => `presence:wb:${deviceId}`;

/**
 * Whether it is time to persist lastSeenAt for this device.
 *
 * Claims the slot as it answers, so two concurrent heartbeats cannot both
 * decide to write. Without Redis it returns true — `next dev` has one panel
 * and one process, and an extra write there costs nothing.
 */
export async function shouldPersistLastSeen(deviceId: string): Promise<boolean> {
  const r = redis();
  if (!r) return true;
  try {
    // NX: only the first caller in the window gets the slot.
    const claimed = await r.set(writebackKey(deviceId), 1, {
      px: WRITEBACK_MS,
      nx: true,
    });
    return claimed === "OK";
  } catch (e) {
    reportWarning(e, { code: "presence.writeback", route: "presence/store" });
    // Fail closed here: skipping a durable write is harmless, and doing one
    // per heartbeat during a Redis outage is the load we are removing.
    return false;
  }
}
