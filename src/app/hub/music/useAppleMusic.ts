"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Identity } from "@/lib/color/identity";
import {
  artworkUrl,
  loadMusicKit,
  type MusicKitInstance,
  type MusicKitResource,
} from "./musickit";
import {
  openingAccount,
  readAccounts,
  readDefault,
  removeAccount,
  saveAccount,
  writeDefault,
  type LinkedAccount,
} from "./accounts";

/**
 * Apple Music, wired to the Hub's Music screen.
 *
 * Three states matter and the screen shows all three honestly:
 *   - not configured: the household has no MusicKit credentials on the server
 *   - nobody linked:  MusicKit is ready but no one has signed in yet
 *   - playing:        a real queue, a real position, real artwork
 *
 * Each household member links their own Apple ID, so the Hub plays whoever is
 * selected rather than everyone sharing one account. Switching assigns that
 * person's stored Music User Token; it never calls unauthorize(), which revokes
 * the token with Apple and would destroy the account it was switching away
 * from. Linking someone new clears the current token first, because authorize()
 * returns the existing one without prompting while it is still valid.
 *
 * Playback happens entirely in this browser. The server mints the developer
 * token and nothing else — no listener token, no library, no history.
 */

export type MusicStatus = "loading" | "unconfigured" | "unlinked" | "ready" | "error";

export interface NowPlaying {
  title: string;
  artist: string;
  artwork: string | null;
  /** Seconds. */
  elapsed: number;
  duration: number;
}

export interface Playlist {
  id: string;
  name: string;
  artwork: string | null;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  length: string;
}

export interface QueueItem extends Track {
  /** Position in MusicKit's queue, so tapping can jump straight to it. */
  index: number;
  playing: boolean;
}

export interface AppleMusic {
  status: MusicStatus;
  error: string | null;
  /** Everyone who has linked an Apple Music account on this Hub. */
  accounts: LinkedAccount[];
  /** Whose account is playing. */
  active: Identity | null;
  /** Whose account the Hub opens on. */
  defaultWho: Identity | null;
  /** True while Apple's sign-in window is open. */
  linking: boolean;
  isPlaying: boolean;
  nowPlaying: NowPlaying | null;
  playlists: Playlist[];
  recent: Track[];
  /** What is playing and what follows it. Empty until something is queued. */
  queue: QueueItem[];
  volume: number;
  /** Sign a household member in with their own Apple ID. */
  link: (who: Identity) => void;
  /** Revoke that person's token with Apple and forget it. */
  forget: (who: Identity) => void;
  switchTo: (who: Identity) => void;
  makeDefault: (who: Identity) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (fraction: number) => void;
  setVolume: (value: number) => void;
  playPlaylist: (id: string) => void;
  /** Jump to a queue entry. */
  playQueueIndex: (index: number) => void;
}

/** Milliseconds to "3:56". */
export function formatLength(ms: number | undefined): string {
  if (!ms || ms < 0) return "0:00";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Seconds to "1:42". */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function useAppleMusic(): AppleMusic {
  const [music, setMusic] = useState<MusicKitInstance | null>(null);
  const [status, setStatus] = useState<MusicStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [recent, setRecent] = useState<Track[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [volume, setVolumeState] = useState(0.65);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [active, setActive] = useState<Identity | null>(null);
  const [defaultWho, setDefaultWho] = useState<Identity | null>(null);
  const [linking, setLinking] = useState(false);
  /** Set once MusicKit exists, so callbacks do not close over a stale instance. */
  const kit = useRef<MusicKitInstance | null>(null);

  // Configure once: fetch the developer token, load MusicKit, hand it over.
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/music/apple/token", { cache: "no-store" });
        const json = (await res.json()) as {
          configured: boolean;
          token?: string;
          reason?: string;
        };
        if (!alive) return;

        if (!json.configured) {
          setStatus("unconfigured");
          return;
        }
        if (!json.token) {
          // Credentials are set but unusable — the server knows why, so say it.
          setError(json.reason ?? "The Apple Music credentials on this server are not usable");
          setStatus("error");
          return;
        }

        const global = await loadMusicKit();
        const linked = readAccounts();
        const opening = openingAccount(linked);

        const instance = await global.configure({
          developerToken: json.token,
          app: { name: "famOS Hub", build: "1" },
          // Opening straight on someone's token avoids a visible unauthorised
          // flash on a screen that is simply left on.
          ...(opening ? { musicUserToken: opening.token } : {}),
        });
        if (!alive) return;

        kit.current = instance;
        setMusic(instance);
        setVolumeState(instance.volume);
        setAccounts(linked);
        setDefaultWho(readDefault());
        setActive(opening?.who ?? null);
        setStatus(opening ? "ready" : "unlinked");
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Apple Music would not start");
        setStatus("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Mirror MusicKit's state into React. MusicKit is the source of truth for
  // playback — we never guess at it, because the queue can change under us.
  useEffect(() => {
    if (!music) return;

    const readNowPlaying = () => {
      const item = music.nowPlayingItem;
      setNowPlaying(
        item
          ? {
              title: item.title ?? "Unknown track",
              artist: [item.artistName, item.albumName].filter(Boolean).join(" · "),
              artwork: artworkUrl(item.artwork, 240),
              elapsed: music.currentPlaybackTime,
              duration: music.currentPlaybackDuration || (item.playbackDuration ?? 0) / 1000,
            }
          : null,
      );
    };

    const readQueue = () => {
      const q = music.queue;
      if (!q?.items?.length) {
        setQueue([]);
        return;
      }
      const at = music.nowPlayingItemIndex ?? q.position ?? 0;
      setQueue(
        q.items.map((item, i) => ({
          id: `${item.id}-${i}`,
          title: item.title ?? "Unknown track",
          artist: item.artistName ?? "",
          length: formatLength(item.playbackDuration),
          index: i,
          playing: i === at,
        })),
      );
    };

    const readState = () => {
      const playingState = window.MusicKit?.PlaybackStates?.playing;
      setPlaying(music.playbackState === playingState);
      readNowPlaying();
      readQueue();
    };

    const readTime = () => {
      setNowPlaying((prev) =>
        prev ? { ...prev, elapsed: music.currentPlaybackTime, duration: music.currentPlaybackDuration || prev.duration } : prev,
      );
    };

    music.addEventListener("playbackStateDidChange", readState);
    music.addEventListener("nowPlayingItemDidChange", readNowPlaying);
    music.addEventListener("nowPlayingItemDidChange", readQueue);
    music.addEventListener("queueItemsDidChange", readQueue);
    music.addEventListener("playbackTimeDidChange", readTime);
    readState();

    return () => {
      music.removeEventListener("playbackStateDidChange", readState);
      music.removeEventListener("nowPlayingItemDidChange", readNowPlaying);
      music.removeEventListener("nowPlayingItemDidChange", readQueue);
      music.removeEventListener("queueItemsDidChange", readQueue);
      music.removeEventListener("playbackTimeDidChange", readTime);
    };
  }, [music]);

  // The active listener's own library. Re-reads whenever the account changes,
  // so switching person actually switches whose playlists are on screen.
  useEffect(() => {
    if (!music || status !== "ready" || !active) return;
    let alive = true;
    setPlaylists([]);
    setRecent([]);

    (async () => {
      const [lists, tracks] = await Promise.all([
        music.api.music("/v1/me/library/playlists", { limit: 10 }).catch(() => null),
        music.api.music("/v1/me/recent/played/tracks", { limit: 8 }).catch(() => null),
      ]);
      if (!alive) return;

      if (lists) setPlaylists((lists.data.data ?? []).map(toPlaylist));
      if (tracks) setRecent((tracks.data.data ?? []).map(toTrack));
    })();

    return () => {
      alive = false;
    };
  }, [music, status, active]);

  /**
   * Sign someone in with their own Apple ID.
   *
   * The current token is cleared first: authorize() short-circuits and returns
   * the token already held while it is still valid, so without this the second
   * person to link would silently be handed the first person's account.
   */
  const link = useCallback(
    (who: Identity) => {
      const m = kit.current;
      if (!m || linking) return;

      setLinking(true);
      (async () => {
        try {
          m.musicUserToken = "";
          const token = await m.authorize();
          if (!token) throw new Error("Apple returned no account");

          const next = saveAccount(who, token);
          setAccounts(next);
          setDefaultWho(readDefault());
          setActive(who);
          setStatus("ready");
          setError(null);
        } catch (e) {
          // Put the previous listener back so a cancelled sign-in does not
          // leave the Hub with no account at all.
          const previous = accounts.find((a) => a.who === active);
          if (previous) m.musicUserToken = previous.token;
          setError(e instanceof Error ? e.message : "That sign-in did not complete");
        } finally {
          setLinking(false);
        }
      })();
    },
    [accounts, active, linking],
  );

  /** Play as someone who has already linked. Never unauthorize(): that revokes. */
  const switchTo = useCallback(
    (who: Identity) => {
      const m = kit.current;
      const account = accounts.find((a) => a.who === who);
      if (!m || !account || who === active) return;

      void m.stop().catch(() => {
        /* nothing was playing */
      });
      m.musicUserToken = account.token;
      setActive(who);
      setNowPlaying(null);
      setPlaying(false);
      setQueue([]);
      setStatus("ready");
    },
    [accounts, active],
  );

  /**
   * Revoke with Apple, not just locally: their token has to be active for
   * unauthorize() to revoke the right one, so it is made active first.
   */
  const forget = useCallback(
    (who: Identity) => {
      const m = kit.current;
      const account = accounts.find((a) => a.who === who);
      if (!m || !account) return;

      (async () => {
        try {
          m.musicUserToken = account.token;
          await m.unauthorize();
        } catch {
          // Apple would not revoke it; dropping our copy is still right.
        }

        const next = removeAccount(who);
        setAccounts(next);
        setDefaultWho(readDefault());

        const opening = openingAccount(next);
        if (opening) {
          m.musicUserToken = opening.token;
          setActive(opening.who);
          setStatus("ready");
        } else {
          m.musicUserToken = "";
          setActive(null);
          setStatus("unlinked");
        }
        setNowPlaying(null);
        setPlaying(false);
      })();
    },
    [accounts],
  );

  const makeDefault = useCallback((who: Identity) => {
    writeDefault(who);
    setDefaultWho(who);
  }, []);

  const guard = useCallback(
    (fn: (m: MusicKitInstance) => Promise<unknown> | void) => () => {
      if (!music) return;
      Promise.resolve(fn(music)).catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Apple Music refused that"),
      );
    },
    [music],
  );

  return {
    status,
    error,
    accounts,
    active,
    defaultWho,
    linking,
    isPlaying,
    nowPlaying,
    playlists,
    recent,
    queue,
    volume,
    link,
    forget,
    switchTo,
    makeDefault,
    toggle: guard((m) => (isPlaying ? m.pause() : m.play())),
    next: guard((m) => m.skipToNextItem()),
    previous: guard((m) => m.skipToPreviousItem()),
    seek: (fraction: number) => {
      if (!music) return;
      const duration = music.currentPlaybackDuration;
      if (duration > 0) void music.seekToTime(Math.max(0, Math.min(1, fraction)) * duration);
    },
    setVolume: (value: number) => {
      if (!music) return;
      const clamped = Math.max(0, Math.min(1, value));
      music.volume = clamped;
      setVolumeState(clamped);
    },
    playQueueIndex: (index: number) => {
      if (!music) return;
      void music
        .changeToMediaAtIndex(index)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "That track would not start"));
    },
    playPlaylist: (id: string) => {
      if (!music) return;
      void music
        .setQueue({ playlist: id })
        .then(() => music.play())
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "That playlist would not start"));
    },
  };
}

function toPlaylist(r: MusicKitResource): Playlist {
  return {
    id: r.id,
    name: r.attributes?.name ?? "Playlist",
    artwork: artworkUrl(r.attributes?.artwork, 120),
  };
}

function toTrack(r: MusicKitResource): Track {
  return {
    id: r.id,
    title: r.attributes?.name ?? "Unknown track",
    artist: r.attributes?.artistName ?? "",
    length: formatLength(r.attributes?.durationInMillis),
  };
}
