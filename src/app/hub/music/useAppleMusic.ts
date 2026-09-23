"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Identity } from "@/lib/color/identity";
import { getDeviceSecret } from "@/lib/client/identity";
import {
  love,
  lovedIds,
  searchCatalog,
  storefront,
  unlove,
  type LovableKind,
} from "@/lib/music/appleApi";
import { clearResume, queueDescriptor, readResume, saveResume } from "./resume";
import { HandoffWaiter, newHandoffId, type HandoffAnswer } from "./handoffAck";
import { indexAfterMove, reorder } from "@/lib/music/reorder";
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
import { BRAND } from "@/lib/brand";

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

export interface SearchResults {
  songs: Track[];
  playlists: Playlist[];
}

export type RemoteAction = "play" | "pause" | "next" | "previous" | "volume";

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
  /**
   * Pull the music down under a voice, and put it back afterwards. Never to
   * silence: a broadcast over music you can still hear reads as the house
   * talking over itself, which is the point. Muting reads as a fault.
   */
  duck: (on: boolean) => void;
  /** True while something is being said over the top. */
  ducked: boolean;
  /** Loop the song that is playing. */
  repeatOne: boolean;
  toggleRepeatOne: () => void;
  /** Catalog search. Empty term gives empty results rather than everything. */
  search: (term: string) => Promise<SearchResults>;
  /** Put a track straight after the one playing. */
  queueNext: (songId: string) => void;
  /** Put a track at the end of the queue. */
  queueLater: (songId: string) => void;
  /**
   * Move a queue entry. MusicKit has no reorder call, so this hands it a whole
   * new queue and puts the playhead back — see the note on reordering below.
   */
  reorderQueue: (from: number, to: number) => void;
  /** True while a reorder is re-seating the queue. */
  reordering: boolean;
  /** Ids the listener has loved, for whatever is currently on screen. */
  loved: Set<string>;
  toggleLove: (kind: LovableKind, id: string) => void;
  /**
   * True when the queue was restored after a reload and is sitting where it
   * left off. Browsers will not start audio without a tap, so the panel waits
   * for one rather than pretending it is playing.
   */
  resumed: boolean;
  /**
   * Send what is playing to another panel, and fall silent once that panel
   * says the music started. Resolves to null on success, or the reason it
   * could not go — in which case it is still playing here.
   */
  handOffTo: (deviceId: string) => Promise<string | null>;
  /**
   * Pick up what another panel was playing, and tell it whether that worked
   * when it asked to be told.
   */
  acceptHandoff: (cmd: {
    trackIds: string[];
    startIndex: number;
    startTime: number;
    handoffId?: string;
    fromDeviceId?: string;
  }) => void;
  /** The other end of a handoff this panel sent says whether it started. */
  handoffResult: (answer: HandoffAnswer) => void;
  /**
   * Ask the panel that is playing to hand over to this one. Resolves to null
   * once the request is away, or the reason it could not be made.
   */
  bringHere: (fromDeviceId: string) => Promise<string | null>;
  /** Work another panel's player — transport and volume, from this one. */
  controlRemote: (deviceId: string, action: RemoteAction, value?: number) => Promise<string | null>;
  /** Apply an instruction that arrived from another panel. */
  applyRemote: (action: RemoteAction, value?: number) => void;
}

/**
 * How long a panel taking a handoff waits for sound before saying it could not
 * play. Inside the sender's own wait (HANDOFF_ACK_MS), so a "no" gets back
 * before the sender gives up and says only that nothing was heard.
 */
const UNTIL_PLAYING_MS = 8_000;

/** Resolves true once MusicKit reports it is playing, false if it has not by `ms`. */
function untilPlaying(m: MusicKitInstance, ms: number): Promise<boolean> {
  const playing = () => m.playbackState === window.MusicKit?.PlaybackStates?.playing;
  if (playing()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (result: boolean) => {
      clearTimeout(timer);
      m.removeEventListener("playbackStateDidChange", check);
      resolve(result);
    };
    const check = () => {
      if (playing()) done(true);
    };
    const timer = setTimeout(() => done(false), ms);
    m.addEventListener("playbackStateDidChange", check);
  });
}

/** Tell the panel that sent a handoff whether it started here. */
async function ackHandoff(handoffId: string, fromDeviceId: string, ok: boolean, error?: string): Promise<void> {
  const secret = getDeviceSecret();
  if (!secret) return;
  await fetch("/api/music/handoff/ack", {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-secret": secret },
    body: JSON.stringify({ handoffId, fromDeviceId, ok, ...(error ? { error } : {}) }),
  }).catch(() => {
    /* the sender times out and keeps playing, which is the safe side */
  });
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
  const [ducked, setDucked] = useState(false);
  const [repeatOne, setRepeatOne] = useState(false);
  const [loved, setLoved] = useState<Set<string>>(new Set());
  const [resumed, setResumed] = useState(false);
  const [reordering, setReordering] = useState(false);
  /** Needed for the REST calls MusicKit has no helper for. */
  const developerToken = useRef<string>("");
  /** Resolved once, lazily. Catalog search will not work without it. */
  const storefrontId = useRef<string>("");
  /** The level to come back to. Tracks the slider even while ducked. */
  const baseVolume = useRef(0.65);
  const [volume, setVolumeState] = useState(0.65);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [active, setActive] = useState<Identity | null>(null);
  const [defaultWho, setDefaultWho] = useState<Identity | null>(null);
  const [linking, setLinking] = useState(false);
  /** Set once MusicKit exists, so callbacks do not close over a stale instance. */
  const kit = useRef<MusicKitInstance | null>(null);
  /**
   * Handoffs sent from here that have not been answered yet. A late "it
   * started" after this panel gave up waiting still means two rooms on one
   * subscription, so this one steps back then.
   */
  const handoffs = useRef<HandoffWaiter | null>(null);
  if (!handoffs.current) {
    handoffs.current = new HandoffWaiter(() => {
      void kit.current?.pause().catch(() => {});
    });
  }

  // Configure once: fetch the developer token, load MusicKit, hand it over.
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const secret = getDeviceSecret();
        if (!secret) {
          setError("This Hub is not paired to the house");
          setStatus("error");
          return;
        }
        const res = await fetch("/api/music/apple/token", {
          cache: "no-store",
          headers: { "x-device-secret": secret },
        });
        const json = (await res.json()) as {
          configured: boolean;
          token?: string;
          reason?: string;
          error?: string;
        };
        if (!alive) return;

        if (!res.ok) {
          setError(json.error ?? "The house would not hand over the Apple Music token");
          setStatus("error");
          return;
        }
        if (!json.configured) {
          setStatus("unconfigured");
          return;
        }
        developerToken.current = json.token ?? "";
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
          app: { name: BRAND.appName, build: "1" },
          // Opening straight on someone's token avoids a visible unauthorised
          // flash on a screen that is simply left on.
          ...(opening ? { musicUserToken: opening.token } : {}),
        });
        if (!alive) return;

        kit.current = instance;
        setMusic(instance);
        setVolumeState(instance.volume);
        baseVolume.current = instance.volume;
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

    const readRepeat = () => {
      const one = window.MusicKit?.PlayerRepeatMode?.one ?? 1;
      setRepeatOne(music.repeatMode === one);
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
    music.addEventListener("repeatModeDidChange", readRepeat);
    music.addEventListener("playbackTimeDidChange", readTime);
    readState();
    readRepeat();

    return () => {
      music.removeEventListener("playbackStateDidChange", readState);
      music.removeEventListener("nowPlayingItemDidChange", readNowPlaying);
      music.removeEventListener("nowPlayingItemDidChange", readQueue);
      music.removeEventListener("queueItemsDidChange", readQueue);
      music.removeEventListener("repeatModeDidChange", readRepeat);
      music.removeEventListener("playbackTimeDidChange", readTime);
    };
  }, [music]);

  /**
   * Put the queue back where it was.
   *
   * A wall panel gets reloaded — a deploy, a crash, the power — and coming back
   * to silence with an empty queue is the moment it stops feeling like an
   * appliance. The position is restored but playback is not started: no browser
   * will begin audio without a gesture, so the panel sits ready and the first
   * tap on play picks up mid-song.
   */
  useEffect(() => {
    if (!music || status !== "ready" || !active) return;
    const point = readResume();
    if (!point) return;

    let alive = true;
    void (async () => {
      try {
        await music.setQueue({ ...queueDescriptor(point.tracks), startWith: point.index });
        if (point.time > 0) await music.seekToTime(point.time);
        if (alive) setResumed(true);
      } catch (e) {
        // Say why rather than clearing in silence. A queue that quietly fails
        // to come back looks exactly like one that was never saved, which is
        // the hardest possible thing to be told about.
        clearResume();
        if (alive) {
          setError(
            e instanceof Error
              ? `Could not pick up where you left off: ${e.message}`
              : "Could not pick up where you left off",
          );
        }
      }
    })();

    return () => {
      alive = false;
    };
    // Deliberately once per account: re-running on every queue change would
    // undo what the listener has just done.
  }, [music, status, active]);

  // Remember where we are, so a reload can come back to it.
  useEffect(() => {
    if (!music || status !== "ready") return;

    const remember = () => {
      const items = music.queue?.items ?? [];
      if (!items.length) return;
      saveResume({
        tracks: items.slice(0, 100).map((i) => ({
          // A library track's catalog id resolves anywhere; its library id
          // only resolves on the account that owns it.
          id: i.playParams?.catalogId ?? i.id,
          type: i.playParams?.catalogId ? "songs" : (i.type ?? "songs"),
        })),
        index: Math.max(0, music.nowPlayingItemIndex ?? 0),
        time: Math.max(0, Math.floor(music.currentPlaybackTime ?? 0)),
      });
    };

    // Often enough to lose only seconds, rarely enough not to thrash storage.
    const id = window.setInterval(remember, 10_000);
    window.addEventListener("pagehide", remember);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", remember);
      remember();
    };
  }, [music, status]);

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

  // Other panels need to know whether a handoff has anywhere to land here. The
  // token itself stays on this device; only its existence is reported.
  useEffect(() => {
    if (status === "loading" || status === "unconfigured") return;
    const secret = getDeviceSecret();
    if (!secret) return;

    const report = () =>
      fetch("/api/music/linked", {
        method: "POST",
        headers: { "content-type": "application/json", "x-device-secret": secret },
        body: JSON.stringify({
          linked: accounts.length > 0,
          // Only while actually playing: a paused panel is not playing
          // anything, and should not claim a song on everyone else's screen.
          nowPlaying:
            isPlaying && nowPlaying
              ? { title: nowPlaying.title.slice(0, 200), artist: nowPlaying.artist.slice(0, 200) }
              : null,
        }),
      }).catch(() => {
        /* the next tick reports again */
      });

    void report();
    // Refreshed inside the staleness window, so the other panels' view of this
    // one expires on its own if this panel stops talking.
    const id = window.setInterval(report, 30_000);
    return () => window.clearInterval(id);
  }, [accounts.length, status, isPlaying, nowPlaying]);

  const refreshLoved = useCallback(
    async (ids: string[], kind: LovableKind) => {
      const m = kit.current;
      if (!m || !developerToken.current || !m.musicUserToken || !ids.length) return;
      const found = await lovedIds(
        { developerToken: developerToken.current, musicUserToken: m.musicUserToken },
        kind,
        ids,
      ).catch(() => new Set<string>());
      if (found.size) setLoved((prev) => new Set([...prev, ...found]));
    },
    [],
  );

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
      // Moving the slider while a voice is over the top sets the level to come
      // back to, not the level right now.
      baseVolume.current = clamped;
      music.volume = ducked ? duckedLevel(clamped) : clamped;
      setVolumeState(clamped);
    },

    loved,
    resumed,

    search: async (term: string): Promise<SearchResults> => {
      const m = kit.current;
      const query = term.trim();
      if (!m || query.length < 2) return { songs: [], playlists: [] };

      const auth = { developerToken: developerToken.current, musicUserToken: m.musicUserToken };
      if (!auth.developerToken) {
        setError("Search needs the Apple Music credentials on this server");
        return { songs: [], playlists: [] };
      }

      try {
        // Resolve the storefront before searching rather than trusting whatever
        // MusicKit has so far. Catalog search is per-storefront, and an
        // unresolved one produced `/v1/catalog/undefined/search` — a 404 that
        // looked exactly like "nothing found".
        if (!storefrontId.current) {
          storefrontId.current = m.storefrontId || (await storefront(auth)) || "";
        }
        if (!storefrontId.current) {
          setError("Apple Music has not said which storefront this account is in");
          return { songs: [], playlists: [] };
        }

        const found = await searchCatalog(auth, storefrontId.current, query);
        const songs: Track[] = found.songs.map((t) => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          length: formatLength(t.durationMs),
        }));
        const playlists: Playlist[] = found.playlists.map((p) => ({
          id: p.id,
          name: p.name,
          artwork: p.artworkUrl ? p.artworkUrl.replace("{w}", "120").replace("{h}", "120") : null,
        }));

        setError(null);
        // Mark what is already loved, so the heart is right as it appears.
        void refreshLoved(songs.map((t) => t.id), "songs");
        return { songs, playlists };
      } catch (e) {
        // A failed search and a search with no matches look identical on screen
        // otherwise, and they want very different things done about them.
        setError(e instanceof Error ? `Search failed: ${e.message}` : "Search is unavailable");
        return { songs: [], playlists: [] };
      }
    },

    queueNext: (songId: string) => {
      const m = kit.current;
      if (!m) return;
      void m
        .playNext({ song: songId })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "That would not queue"));
    },

    reordering,

    /**
     * Reordering costs a queue reload, because MusicKit gives us no other way:
     * `remove` is deprecated and there is no move. So the new order goes in
     * through setQueue, and the playhead is put back by seeking to where it was.
     *
     * The track that was playing is located by working the move out
     * arithmetically rather than by looking its id up again — a family queue
     * can hold the same song twice, and an id lookup would eventually resume
     * the wrong copy.
     */
    reorderQueue: (from: number, to: number) => {
      const m = kit.current;
      const items = m?.queue?.items ?? [];
      if (!m || !items.length || from === to) return;
      if (from < 0 || from >= items.length) return;

      const current = Math.max(0, m.nowPlayingItemIndex ?? 0);
      const ids = reorder(items.map((i) => i.id), from, to);
      const startWith = indexAfterMove(current, from, Math.max(0, Math.min(to, items.length - 1)));
      const at = Math.max(0, m.currentPlaybackTime ?? 0);
      const wasPlaying = isPlaying;

      setReordering(true);
      void (async () => {
        try {
          await m.setQueue({ songs: ids, startWith });
          if (at > 0) await m.seekToTime(at);
          if (wasPlaying) await m.play();
        } catch (e) {
          setError(e instanceof Error ? e.message : "The queue would not take that order");
        } finally {
          setReordering(false);
        }
      })();
    },

    queueLater: (songId: string) => {
      const m = kit.current;
      if (!m) return;
      void m
        .playLater({ song: songId })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : "That would not queue"));
    },

    toggleLove: (kind: LovableKind, id: string) => {
      const m = kit.current;
      const auth = m && {
        developerToken: developerToken.current,
        musicUserToken: m.musicUserToken,
      };
      if (!auth?.developerToken || !auth.musicUserToken) return;

      const on = loved.has(id);
      // Move the heart now and put it back if Apple disagrees: a tap that waits
      // on a round trip feels broken on a wall panel.
      setLoved((prev) => {
        const next = new Set(prev);
        if (on) next.delete(id);
        else next.add(id);
        return next;
      });

      void (on ? unlove(auth, kind, id) : love(auth, kind, id)).catch((e: unknown) => {
        setLoved((prev) => {
          const next = new Set(prev);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        });
        setError(e instanceof Error ? e.message : "Apple Music would not save that");
      });
    },

    repeatOne,
    toggleRepeatOne: () => {
      if (!music) return;
      const modes = window.MusicKit?.PlayerRepeatMode;
      const next = repeatOne ? (modes?.none ?? 0) : (modes?.one ?? 1);
      music.repeatMode = next;
      // Not every playback path supports it, and MusicKit only warns; read back
      // rather than assume the button did anything.
      setRepeatOne(music.repeatMode === (modes?.one ?? 1));
    },

    duck: (on: boolean) => {
      if (!music) return;
      setDucked(on);
      music.volume = on ? duckedLevel(baseVolume.current) : baseVolume.current;
    },
    ducked,
    handOffTo: async (deviceId: string): Promise<string | null> => {
      const m = kit.current;
      const items = m?.queue?.items ?? [];
      if (!m || !items.length) return "There is nothing playing to hand over";

      const secret = getDeviceSecret();
      if (!secret) return "This Hub is not paired to the house";

      const waiter = handoffs.current!;
      const handoffId = newHandoffId();
      // Waiting before sending: the answer comes over the control channel and
      // can beat the HTTP response back.
      const answer = waiter.expect(handoffId);

      try {
        const res = await fetch("/api/music/handoff", {
          method: "POST",
          headers: { "content-type": "application/json", "x-device-secret": secret },
          body: JSON.stringify({
            toDeviceId: deviceId,
            // Catalog ids where they exist: the panel receiving this may be
            // signed in as somebody else, and a library id means nothing there.
            trackIds: items.slice(0, 100).map((i) => i.playParams?.catalogId ?? i.id),
            startIndex: Math.max(0, m.nowPlayingItemIndex ?? 0),
            startTime: Math.max(0, Math.floor(m.currentPlaybackTime ?? 0)),
            handoffId,
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) {
          waiter.cancel(handoffId);
          return json.error ?? "That panel could not take it";
        }
      } catch {
        waiter.cancel(handoffId);
        return "The house could not be reached";
      }

      // Only now stop, and only if it started there: one subscription streams
      // to one device, and going quiet on anything less than "it is playing"
      // is how both rooms ended up silent with nothing on either screen.
      const outcome = await answer;
      if (outcome.kind === "played") {
        await m.pause().catch(() => {});
        return null;
      }
      if (outcome.kind === "refused") return `${outcome.error} — still playing here`;
      return "That panel did not start playing — still playing here";
    },

    handoffResult: (answer: HandoffAnswer) => {
      handoffs.current?.settle(answer);
    },

    bringHere: async (fromDeviceId: string): Promise<string | null> => {
      const secret = getDeviceSecret();
      if (!secret) return "This Hub is not paired to the house";

      try {
        const res = await fetch("/api/music/fetch", {
          method: "POST",
          headers: { "content-type": "application/json", "x-device-secret": secret },
          body: JSON.stringify({ fromDeviceId }),
        });
        const json = (await res.json()) as { error?: string };
        return res.ok ? null : (json.error ?? "That panel could not hand it over");
      } catch {
        return "The house could not be reached";
      }
    },

    controlRemote: async (deviceId: string, action: RemoteAction, value?: number) => {
      const secret = getDeviceSecret();
      if (!secret) return "This Hub is not paired to the house";
      try {
        const res = await fetch("/api/music/control", {
          method: "POST",
          headers: { "content-type": "application/json", "x-device-secret": secret },
          body: JSON.stringify({ deviceId, action, value }),
        });
        const json = (await res.json()) as { error?: string };
        return res.ok ? null : (json.error ?? "That panel would not take it");
      } catch {
        return "The house could not be reached";
      }
    },

    applyRemote: (action: RemoteAction, value?: number) => {
      const m = kit.current;
      if (!m) return;
      switch (action) {
        case "play":
          void m.play().catch(() => {});
          break;
        case "pause":
          void m.pause().catch(() => {});
          break;
        case "next":
          void m.skipToNextItem().catch(() => {});
          break;
        case "previous":
          void m.skipToPreviousItem().catch(() => {});
          break;
        case "volume": {
          if (value === undefined) break;
          const clamped = Math.max(0, Math.min(1, value));
          baseVolume.current = clamped;
          // Respect a voice that is currently over the top: the level to come
          // back to changes, what is audible right now stays ducked.
          m.volume = ducked ? duckedLevel(clamped) : clamped;
          setVolumeState(clamped);
          break;
        }
      }
    },

    acceptHandoff: ({ trackIds, startIndex, startTime, handoffId, fromDeviceId }) => {
      const m = kit.current;
      // Answer the sender either way, so it keeps playing rather than waiting
      // out its timeout when this panel cannot take it.
      const answer = (ok: boolean, error?: string) => {
        if (handoffId && fromDeviceId) void ackHandoff(handoffId, fromDeviceId, ok, error);
      };
      if (!m) {
        answer(false, "Apple Music is not ready on that panel");
        return;
      }
      if (!m.musicUserToken) {
        answer(false, "Nobody is signed in to Apple Music on that panel");
        return;
      }
      void (async () => {
        try {
          setResumed(false);
          await m.setQueue({ songs: trackIds, startWith: startIndex });
          await m.play();
          if (startTime > 0) await m.seekToTime(startTime);
          // play() resolving is not sound coming out: a browser that blocks
          // autoplay, or an expired token, leaves the player stopped without
          // throwing. Only a playing state counts.
          if (!(await untilPlaying(m, UNTIL_PLAYING_MS))) {
            answer(false, "That panel could not start playing");
            return;
          }
          answer(true);
        } catch (e) {
          // Library ids belong to the account that owns them, so a queue handed
          // over from a different Apple ID can simply not resolve here.
          const message = e instanceof Error ? e.message : "That music would not play here";
          setError(message);
          answer(false, message.slice(0, 200));
        }
      })();
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

/**
 * A quarter of the level it was at, with a floor so it never disappears.
 * Proportional rather than absolute, so ducking music that was already quiet
 * does not make it louder.
 */
export function duckedLevel(base: number): number {
  return Math.max(0.05, base * 0.25);
}
