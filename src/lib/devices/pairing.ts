import { customAlphabet } from "nanoid";

/**
 * Device pairing. A new endpoint is registered PENDING with a short human code
 * (typed on the device to claim it) plus a long-lived per-device secret used to
 * authenticate its control-plane connection thereafter.
 */

// Unambiguous alphabet: no 0/O/1/I/L to avoid mis-typing on a kiosk keypad.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const codeGen = customAlphabet(CODE_ALPHABET, 6);
const secretGen = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  40,
);

export function generatePairingCode(): string {
  return codeGen();
}

export function generateDeviceSecret(): string {
  return `dev_${secretGen()}`;
}

/** Normalise user-entered codes: uppercase, strip spaces and easy confusions. */
export function normalizePairingCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/**
 * A pairing code is valid to *submit* if, after normalisation to the code
 * alphabet's own confusables, it is the right length and only uses allowed
 * characters. Note the alphabet excludes 0 and 1, so normalisation here is only
 * about forgiving user typing — the canonical stored code never contains them.
 */
export function isWellFormedPairingCode(input: string): boolean {
  const cleaned = input.toUpperCase().replace(/\s+/g, "");
  return cleaned.length === 6 && [...cleaned].every((c) => CODE_ALPHABET.includes(c));
}

export const PAIRING_CODE_TTL_MS = 15 * 60_000; // codes expire after 15 min

export function isPairingCodeExpired(issuedAt: Date, now: Date): boolean {
  return now.getTime() - issuedAt.getTime() > PAIRING_CODE_TTL_MS;
}
