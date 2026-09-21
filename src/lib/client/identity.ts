/**
 * Per-device secret storage for panels. Persisted in localStorage. Client-only.
 *
 * Controllers used to mint a browser-local identity here and send it as the
 * LiveKit participant identity. The server derives that from the session now,
 * so there is nothing for a controller to remember.
 */

const DEVICE_SECRET_KEY = "intercom.deviceSecret";
const DEVICE_ID_KEY = "intercom.deviceId";

export function getDeviceSecret(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_SECRET_KEY);
}

export function saveDeviceCredentials(deviceId: string, secret: string): void {
  localStorage.setItem(DEVICE_ID_KEY, deviceId);
  localStorage.setItem(DEVICE_SECRET_KEY, secret);
}

export function clearDeviceCredentials(): void {
  localStorage.removeItem(DEVICE_ID_KEY);
  localStorage.removeItem(DEVICE_SECRET_KEY);
}
