"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Identity } from "@/lib/color/identity";
import { getDeviceSecret } from "@/lib/client/identity";
import {
  artistTopSongs,
  charts as fetchCharts,
  EMPTY_RESULTS,
  filterResults,
  heavyRotation,
  libraryPage,
  love,
  lovedIds,
  recommendations,
  searchCatalog,
  searchLibrary,
  searchSuggestions,
  stations as fetchStations,
  storefront,
  unlove,
  cleanOnly as dropExplicit,
  type AppleAuth,
  type CatalogResults,
  type LovableKind,
  type MusicItem,
} from "@/lib/music/appleApi";
import { describeMusicKitError, isSkippable, type MusicErrorKind } from "@/lib/music/errors";
import {
  effectiveVolume,
  fadeFactor,
  inQuietHours,
  nextRepeat,
  portableQueue,
  previousRestarts,
  repeatFromKit,
  repeatToKit,
  sleepDeadline,
  withoutIndex,
  type RepeatMode,
  type SleepChoice,
} from "./player";
import { clearResume, queueDescriptor, readResume, saveResume } from "./resume";
import { HandoffWaiter, newHandoffId, type HandoffAnswer } from "./handoffAck";
import { indexAfterMove, reorder } from "@/lib/music/reorder";
import {
  artworkUrl,
  loadMusicKit,
  type MusicKitInstance,
  type MusicKitItem,
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
  /** Apple marks it explicit. */
  explicit: boolean;
  /** Its page on Apple Music, for "Listen on Apple Music". Null when Apple gave none. */
  url: string | null;
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
  explicit?: boolean;
}

export type RemoteAction = "play" | "pause" | "next" | "previous" | "volume" | "shuffle" | "repeat";

export type { MusicItem, CatalogResults } from "@/lib/music/appleApi";
export type { RepeatMode, SleepChoice } from "./player";

/**
 * A search's results and, when it failed, why. Returned together rather than
 * read back from `error` afterwards: the caller holds the hook's value from
 * before the search ran, so a failure set as state arrives one render too late
 * and a broken search looked exactly like "nothing found".
 */
export interface SearchOutcome {
  results: CatalogResults;
  error: string | null;
}

/** What the Music screen can browse, beyond search. */
export interface BrowseApi {
  forYou: () => Promise<{ title: string; items: MusicItem[] }[]>;
  heavyRotation: () => Promise<MusicItem[]>;
  stations: () => Promise<{ personal: MusicItem | null; live: MusicItem[] }>;
  charts: () => Promise<{ songs: MusicItem[]; albums: MusicItem[]; playlists: MusicItem[] }>;
  library: (
    kind: "playlists" | "albums" | "artists" | "songs",
    offset?: number,
  ) => Promise<{ items: MusicItem[]; next: number | null }>;
}

/** A problem the screen should show, with what kind it is so it can offer the right way out. */
export interface MusicProblem {
  kind: MusicErrorKind;
  message: string;
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
  /**
   * Pull the music down under a voice, and put it back afterwards. Never to
   * silence: a broadcast over music you can still hear reads as the house
   * talking over itself, which is the point. Muting reads as a fault.
   */
  duck: (on: boolean) => void;
  /** True while something is being said over the top. */
  ducked: boolean;
  /** off → all → one, as one button. */
  repeat: RepeatMode;
  cycleRepeat: () => void;
  shuffle: boolean;
  toggleShuffle: () => void;
  /** Keep going with similar music when the queue runs out. Remembered per panel. */
  autoplay: boolean;
  toggleAutoplay: () => void;
  /** The sleep timer, when one is set: what was chosen and when it stops (null until known). */
  sleep: { choice: SleepChoice; deadline: number | null } | null;
  setSleep: (choice: SleepChoice | null) => void;
  /**
   * Catalog search (or the listener's own library). Empty term gives empty
   * results rather than everything. Explicit results are dropped on a
   * clean-only panel.
   */
  search: (term: string, where?: "catalog" | "library") => Promise<SearchOutcome>;
  /** Search-as-you-type suggestions. Never an error: an empty list is fine. */
  suggest: (term: string) => Promise<string[]>;
  /** This member's recent searches, newest first. Kept on this panel only. */
  recentSearches: string[];
  rememberSearch: (term: string) => void;
  browse: BrowseApi;
  /** Play whatever this is: a song, album, playlist, station, or an artist's top songs. */
  playItem: (item: MusicItem) => void;
  /** Take one entry out of Up next. */
  removeFromQueue: (index: number) => void;
  /** Everything after the song playing. */
  clearQueue: () => void;
  /** Set by the parent for this panel: explicit songs are hidden and skipped. */
  cleanOnly: boolean;
  setCleanOnly: (on: boolean) => void;
  /** The panel's quiet hours, which cap how loud music can be. Minutes from midnight. */
  setQuietHours: (q: { enabled: boolean; start: number | null; end: number | null }) => void;
  /** True while quiet hours are holding the volume down. */
  quietCapped: boolean;
  /**
   * Something that went wrong, with what kind, so the screen can offer the
   * right door: Apple's subscribe offer, sign in again, or just the reason.
   */
  problem: MusicProblem | null;
  /** A passing note that is not a failure — "skipped a song that isn't available here". */
  notice: string | null;
  dismissProblem: () => void;
  /** Sign the account playing in again, after Apple said its token is no good. */
  relink: () => void;
  /** Apple's own subscribe offer, for the subscription card. */
  subscribeUrl: string;
  /** False while the network is down. The controls stay; the screen says so. */
  online: boolean;
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
    shuffle?: boolean;
    repeat?: RepeatMode;
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
  const [repeat, setRepeat] = useState<RepeatMode>("none");
  const [shuffle, setShuffle] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [sleep, setSleepState] = useState<{ choice: SleepChoice; deadline: number | null } | null>(null);
  const [cleanOnly, setCleanOnlyState] = useState(false);
  const [quietHours, setQuietHoursState] = useState<{ enabled: boolean; start: number | null; end: number | null }>({
    enabled: false,
    start: null,
    end: null,
  });
  const [quietCapped, setQuietCapped] = useState(false);
  const [problem, setProblem] = useState<MusicProblem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [loved, setLoved] = useState<Set<string>>(new Set());
  const [resumed, setResumed] = useState(false);
  const [reordering, setReordering] = useState(false);
  /** Needed for the REST calls MusicKit has no helper for. */
  const developerToken = useRef<string>("");
  /** Resolved once, lazily. Catalog search will not work without it. */
  const storefrontId = useRef<string>("");
  /** The level to come back to. Tracks the slider even while ducked. */
  const baseVolume = useRef(0.65);
  /**
   * Everything that can pull the level down, in refs so the one function that
   * applies it (applyLevel) is always current, whichever path calls it:
   * a voice over the top, quiet hours, and a sleep timer fading out.
   */
  const duckedRef = useRef(false);
  const quietRef = useRef(false);
  const fadeRef = useRef(1);
  const cleanRef = useRef(false);
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

  /**
   * The one place the player's volume is set. The slider's level, held under
   * the quiet-hours cap, faded by a sleep timer, and ducked under a voice —
   * in that order, so each is applied to what the others left. Everything
   * that changes one of those calls this rather than writing volume itself;
   * two paths writing it was how a remote volume change used to undo a duck.
   */
  const applyLevel = useCallback(() => {
    const m = kit.current;
    if (!m) return;
    let level = effectiveVolume(baseVolume.current, quietRef.current) * fadeRef.current;
    if (duckedRef.current) level = duckedLevel(level);
    m.volume = level;
  }, []);

  /**
   * Show a failure with its kind, so the screen can offer the right way out
   * rather than a generic sentence. The MusicKit code is logged once: the
   * mapping was checked against the v3 bundle, but a real non-subscriber
   * Apple ID is the only proof of which code actually arrives.
   */
  const report = useCallback((e: unknown, fallback?: string) => {
    const described = describeMusicKitError(e, fallback);
    if (described.code) console.info(`[music] MusicKit error ${described.code}`);
    setProblem({ kind: described.kind, message: described.message });
    setError(described.message);
    return described;
  }, []);

  /** Both tokens for a REST call, or null when either is missing. */
  const appleAuth = useCallback((): AppleAuth | null => {
    const m = kit.current;
    if (!m || !developerToken.current || !m.musicUserToken) return null;
    return { developerToken: developerToken.current, musicUserToken: m.musicUserToken };
  }, []);

  /**
   * Resolve the storefront before any catalog call rather than trusting
   * whatever MusicKit has so far. An unresolved one produced
   * `/v1/catalog/undefined/search` — a 404 that looked exactly like "nothing
   * found".
   */
  const ensureStorefront = useCallback(async (auth: AppleAuth): Promise<string> => {
    if (!storefrontId.current) {
      storefrontId.current = kit.current?.storefrontId || (await storefront(auth)) || "";
    }
    return storefrontId.current;
  }, []);

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
              explicit: isExplicit(item),
              url: listenUrl(item, music.storefrontId || storefrontId.current),
            }
          : null,
      );
    };

    const readRepeat = () => {
      setRepeat(repeatFromKit(music.repeatMode, window.MusicKit?.PlayerRepeatMode));
    };

    const readShuffle = () => {
      setShuffle(music.shuffleMode === (window.MusicKit?.PlayerShuffleMode?.songs ?? 1));
    };

    const readAutoplay = () => setAutoplay(Boolean(music.autoplayEnabled));

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
          explicit: isExplicit(item),
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

    /*
     * A clean-only panel never plays an explicit song, whichever door it came
     * in by — a playlist, an album, autoplay, a handoff from another room.
     * Filtering what is offered is not enough on its own, because most of
     * those arrive as a whole queue; so the song is checked as it starts.
     */
    const guardExplicit = () => {
      const item = music.nowPlayingItem;
      if (!cleanRef.current || !item || !isExplicit(item)) return;
      setNotice(`Skipped "${item.title ?? "a song"}" — explicit songs are off on this Hub`);
      const last = (music.queue?.items?.length ?? 0) - 1;
      void (music.nowPlayingItemIndex >= last ? music.stop() : music.skipToNextItem()).catch(() => {});
    };

    /*
     * One song that cannot play — gone from the catalogue, not in this
     * country, restricted on this Apple ID — says so and moves on, rather
     * than stopping the music with a generic error. Anything else is a real
     * problem and is shown as one: no subscription, a token Apple no longer
     * accepts, the network.
     */
    const onPlaybackError = (payload?: unknown) => {
      const described = describeMusicKitError(payload);
      if (isSkippable(described.kind)) {
        const title = music.nowPlayingItem?.title;
        setNotice(`${title ? `"${title}": ` : ""}${described.message} Skipped it.`);
        const last = (music.queue?.items?.length ?? 0) - 1;
        if (music.nowPlayingItemIndex < last) void music.skipToNextItem().catch(() => {});
        return;
      }
      report(payload);
    };

    music.addEventListener("playbackStateDidChange", readState);
    music.addEventListener("nowPlayingItemDidChange", readNowPlaying);
    music.addEventListener("nowPlayingItemDidChange", readQueue);
    music.addEventListener("nowPlayingItemDidChange", guardExplicit);
    music.addEventListener("queueItemsDidChange", readQueue);
    music.addEventListener("repeatModeDidChange", readRepeat);
    music.addEventListener("shuffleModeDidChange", readShuffle);
    music.addEventListener("shuffleModeDidChange", readQueue);
    music.addEventListener("autoplayEnabledDidChange", readAutoplay);
    music.addEventListener("playbackTimeDidChange", readTime);
    music.addEventListener("mediaPlaybackError", onPlaybackError);
    readState();
    readRepeat();
    readShuffle();
    readAutoplay();

    return () => {
      music.removeEventListener("playbackStateDidChange", readState);
      music.removeEventListener("nowPlayingItemDidChange", readNowPlaying);
      music.removeEventListener("nowPlayingItemDidChange", readQueue);
      music.removeEventListener("nowPlayingItemDidChange", guardExplicit);
      music.removeEventListener("queueItemsDidChange", readQueue);
      music.removeEventListener("repeatModeDidChange", readRepeat);
      music.removeEventListener("shuffleModeDidChange", readShuffle);
      music.removeEventListener("shuffleModeDidChange", readQueue);
      music.removeEventListener("autoplayEnabledDidChange", readAutoplay);
      music.removeEventListener("playbackTimeDidChange", readTime);
      music.removeEventListener("mediaPlaybackError", onPlaybackError);
    };
  }, [music, report]);

  // Autoplay is this panel's choice, so it is remembered here and put back
  // when MusicKit starts. Off until someone turns it on.
  useEffect(() => {
    if (!music) return;
    if (readFlag(AUTOPLAY_KEY)) music.autoplayEnabled = true;
    setAutoplay(Boolean(music.autoplayEnabled));
  }, [music]);

  // The parent's clean-only setting, as of the last heartbeat. Turning it on
  // also takes out whatever explicit song is playing right now.
  useEffect(() => {
    cleanRef.current = cleanOnly;
    const m = kit.current;
    const item = m?.nowPlayingItem;
    if (cleanOnly && m && item && isExplicit(item)) {
      setNotice(`Skipped "${item.title ?? "a song"}" — explicit songs are off on this Hub`);
      void m.skipToNextItem().catch(() => {});
    }
  }, [cleanOnly, music]);

  // Quiet hours hold the volume down. Checked each minute, because the
  // window opens and closes on the clock rather than on anything the panel does.
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const quiet = inQuietHours(
        quietHours.enabled,
        quietHours.start,
        quietHours.end,
        now.getHours() * 60 + now.getMinutes(),
      );
      quietRef.current = quiet;
      setQuietCapped(quiet);
      applyLevel();
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [quietHours, applyLevel, music]);

  /*
   * The sleep timer. "End of this song" becomes a deadline at the end of the
   * song playing — and, in case someone skips first, stops when the song
   * changes. A clock deadline fades over its last seconds rather than cutting
   * out: the point of a sleep timer is that nobody notices it end.
   */
  useEffect(() => {
    const m = music;
    if (!m || !sleep) return;

    const finish = () => {
      void m.pause().catch(() => {});
      fadeRef.current = 1;
      applyLevel();
      setSleepState(null);
    };

    const startItem = m.nowPlayingItemIndex;
    const onChange = () => {
      if (sleep.choice === "end" && m.nowPlayingItemIndex !== startItem) finish();
    };
    m.addEventListener("nowPlayingItemDidChange", onChange);

    const tick = window.setInterval(() => {
      if (sleep.deadline == null) return;
      const now = Date.now();
      if (now >= sleep.deadline) {
        finish();
        return;
      }
      fadeRef.current = fadeFactor(sleep.deadline, now);
      applyLevel();
    }, 500);

    return () => {
      window.clearInterval(tick);
      m.removeEventListener("nowPlayingItemDidChange", onChange);
      fadeRef.current = 1;
      applyLevel();
    };
  }, [music, sleep, applyLevel]);

  // The network is part of whether this works. Say so while it is gone
  // rather than leaving controls that silently do nothing.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Recent searches are per person and stay on this panel.
  useEffect(() => {
    setRecentSearches(active ? readRecentSearches(active) : []);
  }, [active]);

  // A notice is a passing remark, not a state; it goes on its own.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 8_000);
    return () => window.clearTimeout(id);
  }, [notice]);

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
          setProblem(null);
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
      setProblem(null);
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
  //
  // Keyed on the title and artist, not the NowPlaying object: that object is
  // replaced on every playhead tick, several times a second, and depending on
  // it re-ran this effect — and its immediate report — on every one of them.
  // A playing panel was posting here a few times a second instead of every 30.
  const reportedTitle = isPlaying && nowPlaying ? nowPlaying.title.slice(0, 200) : null;
  const reportedArtist = isPlaying && nowPlaying ? nowPlaying.artist.slice(0, 200) : null;
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
            reportedTitle != null ? { title: reportedTitle, artist: reportedArtist ?? "" } : null,
        }),
      }).catch(() => {
        /* the next tick reports again */
      });

    void report();
    // Refreshed inside the staleness window, so the other panels' view of this
    // one expires on its own if this panel stops talking.
    const id = window.setInterval(report, 30_000);
    return () => window.clearInterval(id);
  }, [accounts.length, status, reportedTitle, reportedArtist]);

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
      Promise.resolve(fn(music)).catch((e: unknown) => report(e, "Apple Music refused that"));
    },
    [music, report],
  );

  /**
   * Previous restarts the song once it is a few seconds in, and only goes
   * back a track from the start of one — the convention in every player.
   * MusicKit's skipToPreviousItem does not do this itself.
   */
  const goBack = useCallback((m: MusicKitInstance) => {
    return previousRestarts(m.currentPlaybackTime ?? 0) ? m.seekToTime(0) : m.skipToPreviousItem();
  }, []);

  const cycleRepeatOn = useCallback((m: MusicKitInstance) => {
    const modes = window.MusicKit?.PlayerRepeatMode;
    const current = repeatFromKit(m.repeatMode, modes);
    m.repeatMode = repeatToKit(nextRepeat(current), modes);
    // Not every playback type supports it and MusicKit only warns; read back
    // rather than assume the button did anything.
    setRepeat(repeatFromKit(m.repeatMode, modes));
  }, []);

  const toggleShuffleOn = useCallback((m: MusicKitInstance) => {
    const modes = window.MusicKit?.PlayerShuffleMode;
    const on = m.shuffleMode === (modes?.songs ?? 1);
    m.shuffleMode = on ? (modes?.off ?? 0) : (modes?.songs ?? 1);
    setShuffle(m.shuffleMode === (modes?.songs ?? 1));
  }, []);

  /** Refuse an explicit item on a clean-only panel, saying why. True when refused. */
  const refuseExplicit = useCallback((item: { contentRating?: string; title?: string }) => {
    if (!cleanRef.current || item.contentRating !== "explicit") return false;
    setNotice(`"${item.title ?? "That"}" is explicit, and explicit songs are off on this Hub`);
    return true;
  }, []);

  /** Re-set the queue to these ids from `startWith`, keeping the song's place and whether it was playing. */
  const reseat = useCallback(
    async (m: MusicKitInstance, ids: string[], startWith: number, keepPosition: boolean) => {
      const at = keepPosition ? Math.max(0, m.currentPlaybackTime ?? 0) : 0;
      const wasPlaying = isPlaying;
      setReordering(true);
      try {
        await m.setQueue({ songs: ids, startWith });
        if (at > 0) await m.seekToTime(at);
        if (wasPlaying) await m.play();
      } finally {
        setReordering(false);
      }
    },
    [isPlaying],
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
    // Not offered on a clean-only panel, where playing one would only be
    // skipped the moment it started.
    recent: cleanOnly ? recent.filter((t) => !t.explicit) : recent,
    queue,
    volume,
    link,
    forget,
    switchTo,
    makeDefault,
    toggle: guard((m) => (isPlaying ? m.pause() : m.play())),
    next: guard((m) => m.skipToNextItem()),
    previous: guard(goBack),
    seek: (fraction: number) => {
      if (!music) return;
      const duration = music.currentPlaybackDuration;
      if (duration > 0) void music.seekToTime(Math.max(0, Math.min(1, fraction)) * duration);
    },
    setVolume: (value: number) => {
      const clamped = Math.max(0, Math.min(1, value));
      // Moving the slider while a voice is over the top sets the level to come
      // back to, not the level right now.
      baseVolume.current = clamped;
      setVolumeState(clamped);
      applyLevel();
    },

    loved,
    resumed,

    search: async (term: string, where: "catalog" | "library" = "catalog"): Promise<SearchOutcome> => {
      const query = term.trim();
      if (query.length < 2) return { results: EMPTY_RESULTS, error: null };

      const auth = appleAuth();
      if (!auth) return { results: EMPTY_RESULTS, error: "Search needs the Apple Music credentials on this server" };

      try {
        let found: CatalogResults;
        if (where === "library") {
          found = await searchLibrary(auth, query);
        } else {
          const store = await ensureStorefront(auth);
          if (!store) {
            return { results: EMPTY_RESULTS, error: "Apple Music has not said which storefront this account is in" };
          }
          found = await searchCatalog(auth, store, query);
        }
        const shown = filterResults(found, cleanRef.current);
        // Mark what is already loved, so the heart is right as it appears. A
        // library song is rated by its catalog id; one without has no rating.
        void refreshLoved(
          shown.songs.map((t) => (t.library ? t.catalogId : t.id)).filter((id): id is string => !!id),
          "songs",
        );
        return { results: shown, error: null };
      } catch (e) {
        // A failed search and a search with no matches look identical on screen
        // otherwise, and they want very different things done about them.
        return {
          results: EMPTY_RESULTS,
          error: e instanceof Error ? `Search failed: ${e.message}` : "Search is unavailable",
        };
      }
    },

    suggest: async (term: string): Promise<string[]> => {
      const auth = appleAuth();
      if (!auth || term.trim().length < 2) return [];
      try {
        const store = await ensureStorefront(auth);
        return store ? await searchSuggestions(auth, store, term) : [];
      } catch {
        return [];
      }
    },

    recentSearches,
    rememberSearch: (term: string) => {
      if (!active) return;
      setRecentSearches(saveRecentSearch(active, term));
    },

    browse: {
      forYou: async () => {
        const auth = appleAuth();
        if (!auth) return [];
        const groups = await recommendations(auth).catch(() => []);
        return groups
          .map((g) => ({ ...g, items: cleanRef.current ? dropExplicit(g.items) : g.items }))
          .filter((g) => g.items.length);
      },
      heavyRotation: async () => {
        const auth = appleAuth();
        if (!auth) return [];
        const items = await heavyRotation(auth).catch(() => []);
        return cleanRef.current ? dropExplicit(items) : items;
      },
      stations: async () => {
        const auth = appleAuth();
        if (!auth) return { personal: null, live: [] };
        const store = await ensureStorefront(auth).catch(() => "");
        return store ? fetchStations(auth, store) : { personal: null, live: [] };
      },
      charts: async () => {
        const auth = appleAuth();
        const empty = { songs: [], albums: [], playlists: [] };
        if (!auth) return empty;
        const store = await ensureStorefront(auth).catch(() => "");
        if (!store) return empty;
        const found = await fetchCharts(auth, store).catch(() => empty);
        return cleanRef.current
          ? { songs: dropExplicit(found.songs), albums: dropExplicit(found.albums), playlists: found.playlists }
          : found;
      },
      library: async (kind, offset = 0) => {
        const auth = appleAuth();
        if (!auth) return { items: [], next: null };
        const page = await libraryPage(auth, kind, offset).catch(() => ({ items: [], next: null }));
        return cleanRef.current ? { ...page, items: dropExplicit(page.items) } : page;
      },
    },

    playItem: (item: MusicItem) => {
      const m = kit.current;
      if (!m || refuseExplicit(item)) return;
      setProblem(null);
      void (async () => {
        try {
          if (item.kind === "artist") {
            // An artist is not a queue; their top songs are what "play" means.
            const auth = appleAuth();
            const store = auth ? await ensureStorefront(auth) : "";
            if (!auth || !store) throw new Error("Apple Music has not said which storefront this account is in");
            // A library artist rarely carries a catalog id, and top songs are a
            // catalog idea — so find them in the catalog by name.
            let artistId = item.library ? item.catalogId : item.id;
            if (!artistId) {
              const found = await searchCatalog(auth, store, item.title, 3);
              artistId = found.artists.find((a) => a.title.toLowerCase() === item.title.toLowerCase())?.id ?? found.artists[0]?.id ?? null;
            }
            if (!artistId) throw new Error(`${item.title} isn't on Apple Music here`);
            let songs = await artistTopSongs(auth, store, artistId);
            if (cleanRef.current) songs = dropExplicit(songs);
            if (!songs.length) throw new Error(`Nothing of ${item.title}'s is available to play here`);
            await m.setQueue({ songs: songs.map((t) => t.id), startWith: 0 });
          } else {
            await m.setQueue({ [item.kind]: item.id });
          }
          await m.play();
        } catch (e) {
          report(e, `${item.title} would not start`);
        }
      })();
    },

    queueNext: (songId: string) => {
      const m = kit.current;
      if (!m) return;
      void m.playNext({ song: songId }).catch((e: unknown) => report(e, "That would not queue"));
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
      void reseat(m, ids, startWith, true).catch((e: unknown) =>
        report(e, "The queue would not take that order"),
      );
    },

    /**
     * Out of Up next. The same queue reload as reordering, for the same
     * reason — MusicKit has no supported remove. Taking out the song that is
     * playing moves on to the next one rather than stopping.
     */
    removeFromQueue: (index: number) => {
      const m = kit.current;
      const items = m?.queue?.items ?? [];
      if (!m || !items.length) return;
      const current = Math.max(0, m.nowPlayingItemIndex ?? 0);
      const plan = withoutIndex(items.map((i) => i.id), index, current);
      if (!plan) {
        void m.stop().catch(() => {});
        return;
      }
      void reseat(m, plan.ids, plan.startWith, !plan.removedCurrent).catch((e: unknown) =>
        report(e, "That would not come out of the queue"),
      );
    },

    clearQueue: () => {
      const m = kit.current;
      const items = m?.queue?.items ?? [];
      if (!m || items.length < 2) return;
      const current = Math.max(0, m.nowPlayingItemIndex ?? 0);
      const playing = items[current];
      if (!playing) return;
      void reseat(m, [playing.id], 0, true).catch((e: unknown) => report(e, "The queue would not clear"));
    },

    queueLater: (songId: string) => {
      const m = kit.current;
      if (!m) return;
      void m.playLater({ song: songId }).catch((e: unknown) => report(e, "That would not queue"));
    },

    toggleLove: (kind: LovableKind, id: string) => {
      const auth = appleAuth();
      if (!auth) return;

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

    repeat,
    cycleRepeat: () => {
      if (music) cycleRepeatOn(music);
    },
    shuffle,
    toggleShuffle: () => {
      if (music) toggleShuffleOn(music);
    },
    autoplay,
    toggleAutoplay: () => {
      if (!music) return;
      music.autoplayEnabled = !music.autoplayEnabled;
      const on = Boolean(music.autoplayEnabled);
      writeFlag(AUTOPLAY_KEY, on);
      setAutoplay(on);
    },
    sleep,
    setSleep: (choice: SleepChoice | null) => {
      if (!choice || !music) {
        setSleepState(null);
        return;
      }
      const now = Date.now();
      // End of the song is a deadline too once the song's length is known,
      // so it fades like the others; the track-change check covers a skip.
      const remaining = (music.currentPlaybackDuration ?? 0) - (music.currentPlaybackTime ?? 0);
      const deadline = choice === "end" ? (remaining > 1 ? now + remaining * 1000 - 500 : null) : sleepDeadline(choice, now);
      setSleepState({ choice, deadline });
    },

    cleanOnly,
    setCleanOnly: (on: boolean) => setCleanOnlyState(on),
    setQuietHours: (q) =>
      setQuietHoursState((prev) =>
        prev.enabled === q.enabled && prev.start === q.start && prev.end === q.end ? prev : q,
      ),
    quietCapped,

    problem,
    notice,
    dismissProblem: () => {
      setProblem(null);
      setError(null);
      setNotice(null);
    },
    relink: () => {
      if (active) link(active);
    },
    subscribeUrl: music?.subscribeURL || APPLE_MUSIC_SUBSCRIBE_URL,
    online,

    duck: (on: boolean) => {
      duckedRef.current = on;
      setDucked(on);
      applyLevel();
    },
    ducked,
    handOffTo: async (deviceId: string): Promise<string | null> => {
      const m = kit.current;
      const items = m?.queue?.items ?? [];
      if (!m || !items.length) return "There is nothing playing to hand over";

      const secret = getDeviceSecret();
      if (!secret) return "This Hub is not paired to the house";

      // Only what can play under another Apple ID travels: catalog ids go,
      // library-only ones are counted and left behind.
      const portable = portableQueue(
        items.slice(0, 100).map((i) => ({
          id: i.id,
          catalogId: i.playParams?.catalogId,
          isLibrary: Boolean(i.playParams?.isLibrary) || (i.type ?? "").startsWith("library-"),
        })),
        Math.max(0, m.nowPlayingItemIndex ?? 0),
      );
      if (!portable.ids.length) return "None of these songs can play on another panel's account";

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
            trackIds: portable.ids,
            startIndex: portable.startIndex,
            // A dropped current song means starting the next one from the top.
            startTime: portable.currentDropped ? 0 : Math.max(0, Math.floor(m.currentPlaybackTime ?? 0)),
            handoffId,
            shuffle,
            repeat,
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
        if (portable.dropped) {
          setNotice(
            `${portable.dropped} ${portable.dropped === 1 ? "song" : "songs"} from this library couldn't go to the other panel's account`,
          );
        }
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
          void goBack(m).catch(() => {});
          break;
        case "shuffle":
          toggleShuffleOn(m);
          break;
        case "repeat":
          cycleRepeatOn(m);
          break;
        case "volume": {
          if (value === undefined) break;
          const clamped = Math.max(0, Math.min(1, value));
          baseVolume.current = clamped;
          setVolumeState(clamped);
          // Through the same path as everything else, so a voice that is over
          // the top stays ducked and quiet hours still hold.
          applyLevel();
          break;
        }
      }
    },

    acceptHandoff: ({ trackIds, startIndex, startTime, handoffId, fromDeviceId, shuffle: shuffled, repeat: repeating }) => {
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
          // Shuffle and repeat came with the queue. Set after it is loaded,
          // because setting a queue resets both.
          if (repeating) m.repeatMode = repeatToKit(repeating, window.MusicKit?.PlayerRepeatMode);
          if (shuffled !== undefined) {
            const modes = window.MusicKit?.PlayerShuffleMode;
            m.shuffleMode = shuffled ? (modes?.songs ?? 1) : (modes?.off ?? 0);
          }
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
          // The same reading of Apple's error as this panel's own screen gets,
          // so the sending panel can say "needs sign-in" rather than a code.
          const described = report(e, "That music would not play here");
          answer(false, described.message.slice(0, 200));
        }
      })();
    },

    playQueueIndex: (index: number) => {
      if (!music) return;
      void music.changeToMediaAtIndex(index).catch((e: unknown) => report(e, "That track would not start"));
    },
    playPlaylist: (id: string) => {
      if (!music) return;
      void music
        .setQueue({ playlist: id })
        .then(() => music.play())
        .catch((e: unknown) => report(e, "That playlist would not start"));
    },
  };
}

/** Apple marks an explicit item; anything else — clean or unrated — is not. */
function isExplicit(item: MusicKitItem): boolean {
  return (item.contentRating ?? item.attributes?.contentRating) === "explicit";
}

/**
 * Where "Listen on Apple Music" goes for this item. Apple's own url when the
 * item carries one; otherwise the catalog song page by id, which Apple
 * resolves for any storefront. A library-only item with neither has no page.
 */
export function listenUrl(item: MusicKitItem, store: string): string | null {
  if (item.attributes?.url) return item.attributes.url;
  const catalogId = item.playParams?.catalogId ?? (item.playParams?.isLibrary ? undefined : item.id);
  if (!catalogId || !/^\d+$/.test(catalogId)) return null;
  return `https://music.apple.com/${encodeURIComponent(store || "us")}/song/${catalogId}`;
}

/**
 * Apple's subscribe page, for when MusicKit has not produced its own offer
 * link. MusicKit's subscribeURL is preferred: it carries the storefront.
 */
const APPLE_MUSIC_SUBSCRIBE_URL = "https://music.apple.com/subscribe";

const AUTOPLAY_KEY = "famos.applemusic.autoplay";
const RECENT_SEARCHES_KEY = "famos.applemusic.recentSearches";
const RECENT_SEARCHES_MAX = 8;

function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(key, "1");
    else window.localStorage.removeItem(key);
  } catch {
    /* holds for this session */
  }
}

/** Per person, because one member's searches are nobody else's business on a shared screen. */
function readRecentSearches(who: Identity): string[] {
  try {
    const all = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? "{}") as Record<string, unknown>;
    const mine = all[who];
    return Array.isArray(mine) ? mine.filter((t): t is string => typeof t === "string").slice(0, RECENT_SEARCHES_MAX) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(who: Identity, term: string): string[] {
  const clean = term.trim();
  if (clean.length < 2) return readRecentSearches(who);
  const next = [clean, ...readRecentSearches(who).filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(
    0,
    RECENT_SEARCHES_MAX,
  );
  try {
    const all = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? "{}") as Record<string, unknown>;
    all[who] = next;
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(all));
  } catch {
    /* holds for this session */
  }
  return next;
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
    explicit: r.attributes?.contentRating === "explicit",
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
