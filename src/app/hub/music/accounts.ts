"use client";

import type { Identity } from "@/lib/color/identity";

/**
 * Apple Music accounts linked to this Hub.
 *
 * Each household member signs in with their own Apple ID, so the Hub plays
 * their library and their playlists rather than everyone sharing one account.
 * The Music User Token Apple issues is kept on the device, never on our server
 * — it is scoped to Apple Music (playback, library, recents) and is not an
 * Apple ID credential.
 *
 * It does mean anyone standing at the Hub can play as anyone who has linked,
 * which is the same trade the screen already makes for presence and the shared
 * day: a kitchen display is a shared object. "Forget" revokes the token with
 * Apple rather than only dropping our copy.
 */

const ACCOUNTS_KEY = "famos.applemusic.accounts";
const DEFAULT_KEY = "famos.applemusic.default";

export interface LinkedAccount {
  who: Identity;
  token: string;
  linkedAt: string;
}

function isAccount(v: unknown): v is LinkedAccount {
  const a = v as LinkedAccount;
  return !!a && typeof a.who === "string" && typeof a.token === "string" && a.token.length > 0;
}

export function readAccounts(): LinkedAccount[] {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAccount) : [];
  } catch {
    return [];
  }
}

function writeAccounts(accounts: LinkedAccount[]): void {
  try {
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    /* the list still works for this session */
  }
}

/** Link or re-link someone. Re-linking replaces their token rather than adding a second. */
export function saveAccount(who: Identity, token: string): LinkedAccount[] {
  const next = [
    ...readAccounts().filter((a) => a.who !== who),
    { who, token, linkedAt: new Date().toISOString() },
  ];
  writeAccounts(next);
  if (!readDefault()) writeDefault(who);
  return next;
}

export function removeAccount(who: Identity): LinkedAccount[] {
  const next = readAccounts().filter((a) => a.who !== who);
  writeAccounts(next);
  if (readDefault() === who) writeDefault(next[0]?.who ?? null);
  return next;
}

export function readDefault(): Identity | null {
  try {
    return (window.localStorage.getItem(DEFAULT_KEY) as Identity | null) || null;
  } catch {
    return null;
  }
}

export function writeDefault(who: Identity | null): void {
  try {
    if (who) window.localStorage.setItem(DEFAULT_KEY, who);
    else window.localStorage.removeItem(DEFAULT_KEY);
  } catch {
    /* the choice holds for this session */
  }
}

/** Whose account the Hub should open on: the stated default, else whoever is linked. */
export function openingAccount(accounts: LinkedAccount[]): LinkedAccount | null {
  const preferred = readDefault();
  return accounts.find((a) => a.who === preferred) ?? accounts[0] ?? null;
}
