import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with Node's built-in scrypt — no third-party dependency.
 * Stored format: `scrypt$<saltHex>$<hashHex>`. Verification is constant-time.
 */

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/*
 * Work done on a path that is going to return false anyway, so that path costs
 * what a real verification costs. Returning early when there is no stored hash
 * answered in ~2ms where a real check takes ~70ms, which told an unauthenticated
 * caller whether an email had an account — the opposite of what the login
 * route's own comment promises.
 */
const DUMMY_SALT = randomBytes(SALT_BYTES);
async function burnEquivalentWork(password: string): Promise<void> {
  await scryptAsync(password, DUMMY_SALT, KEYLEN);
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) {
    await burnEquivalentWork(password);
    return false;
  }
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    await burnEquivalentWork(password);
    return false;
  }
  const [, saltHex, hashHex] = parts;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    await burnEquivalentWork(password);
    return false;
  }
  if (expected.length !== KEYLEN) {
    await burnEquivalentWork(password);
    return false;
  }

  const derived = (await scryptAsync(
    password,
    Buffer.from(saltHex, "hex"),
    KEYLEN,
  )) as Buffer;
  return timingSafeEqual(derived, expected);
}
