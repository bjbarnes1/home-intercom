/**
 * Resolve an intercom target (a single device or a zone) to the concrete set of
 * endpoint device ids that should receive the page / broadcast / reminder.
 *
 * Pure over a supplied snapshot of devices + zone memberships so it can be
 * tested without a database.
 */

export interface DeviceSnapshot {
  id: string;
  online: boolean;
  doNotDisturb: boolean;
}

export interface Target {
  deviceId?: string;
  zoneId?: string;
}

export interface ResolveOptions {
  /** Exclude devices with Do-Not-Disturb enabled (default true). */
  respectDoNotDisturb?: boolean;
  /** Exclude offline devices (default false — callers may want missed entries). */
  onlineOnly?: boolean;
  /** Never target this device (e.g. the initiator's own controller). */
  excludeDeviceId?: string;
}

export interface ResolveResult {
  /** Devices that will be reached. */
  targets: string[];
  /** Devices skipped because of Do-Not-Disturb. */
  suppressedByDnd: string[];
  /** Devices skipped because they were offline (only when onlineOnly). */
  offline: string[];
}

/**
 * @param target        device or zone to resolve (exactly one should be set)
 * @param devices        snapshot of all household devices
 * @param zoneMembership map of zoneId -> deviceId[] for the household
 */
export function resolveTargets(
  target: Target,
  devices: DeviceSnapshot[],
  zoneMembership: Record<string, string[]>,
  options: ResolveOptions = {},
): ResolveResult {
  const { respectDoNotDisturb = true, onlineOnly = false, excludeDeviceId } = options;

  if ((target.deviceId ? 1 : 0) + (target.zoneId ? 1 : 0) !== 1) {
    throw new Error("Target must specify exactly one of deviceId or zoneId");
  }

  const byId = new Map(devices.map((d) => [d.id, d]));

  let candidateIds: string[];
  if (target.deviceId) {
    candidateIds = [target.deviceId];
  } else {
    candidateIds = zoneMembership[target.zoneId as string] ?? [];
  }

  // Dedupe and drop the excluded device.
  const seen = new Set<string>();
  const result: ResolveResult = { targets: [], suppressedByDnd: [], offline: [] };

  for (const id of candidateIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === excludeDeviceId) continue;

    const device = byId.get(id);
    if (!device) continue; // unknown / retired device id

    if (respectDoNotDisturb && device.doNotDisturb) {
      result.suppressedByDnd.push(id);
      continue;
    }
    if (onlineOnly && !device.online) {
      result.offline.push(id);
      continue;
    }
    result.targets.push(id);
  }

  return result;
}
