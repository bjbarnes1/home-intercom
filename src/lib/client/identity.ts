/**
 * Stable per-browser identity for controllers, and per-device secret storage
 * for endpoints. Persisted in localStorage. Client-only.
 */

const CONTROLLER_ID_KEY = "intercom.controllerId";
const DEVICE_SECRET_KEY = "intercom.deviceSecret";
const DEVICE_ID_KEY = "intercom.deviceId";

function randomId(prefix: string): string {
  const rnd = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export function controllerIdentity(): string {
  if (typeof window === "undefined") return "controller";
  let id = localStorage.getItem(CONTROLLER_ID_KEY);
  if (!id) {
    id = randomId("ctrl");
    localStorage.setItem(CONTROLLER_ID_KEY, id);
  }
  return id;
}

export function getDeviceSecret(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_SECRET_KEY);
}

export function saveDeviceCredentials(deviceId: string, secret: string): void {
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  localStorage.setItem(DEVICE_SECRET_KEY, secret);
}

export function getDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_ID_KEY);
}

export function clearDeviceCredentials(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(DEVICE_SECRET_KEY);
}
