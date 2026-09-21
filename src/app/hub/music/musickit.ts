/**
 * The slice of MusicKit JS v3 the Hub actually uses.
 *
 * Apple ships no types for the browser global, and pulling in the whole surface
 * would be noise: this is the contract we depend on, so a breaking change shows
 * up here as a type error rather than as undefined at runtime.
 */

export interface MusicKitArtwork {
  url: string;
  width?: number;
  height?: number;
}

export interface MusicKitItem {
  id: string;
  title?: string;
  artistName?: string;
  albumName?: string;
  artwork?: MusicKitArtwork;
  /** Milliseconds. */
  playbackDuration?: number;
}

export interface MusicKitResource {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    artwork?: MusicKitArtwork;
    durationInMillis?: number;
  };
}

export type MusicKitEvent =
  | "playbackStateDidChange"
  | "nowPlayingItemDidChange"
  | "playbackTimeDidChange"
  | "authorizationStatusDidChange"
  | "queueItemsDidChange";

export interface MusicKitQueue {
  items: MusicKitItem[];
  /** Index of the item playing now. */
  position: number;
}

export interface MusicKitInstance {
  isAuthorized: boolean;
  /**
   * The listener's Music User Token. Readable after authorize() and assignable,
   * which is how the Hub switches between household members without revoking
   * anyone. Assigning "" clears it, which is what makes the next authorize()
   * actually prompt instead of returning the token already held.
   */
  musicUserToken: string;
  /** 0–1. */
  volume: number;
  /** Seconds. */
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  playbackState: number;
  nowPlayingItem: MusicKitItem | null;
  /** The queue as MusicKit holds it — what is playing and what follows. */
  queue: MusicKitQueue | null;
  nowPlayingItemIndex: number;
  /** Jump straight to a queue entry. */
  changeToMediaAtIndex(index: number): Promise<void>;
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  skipToNextItem(): Promise<void>;
  skipToPreviousItem(): Promise<void>;
  seekToTime(seconds: number): Promise<void>;
  /** `{ songs: string[], startWith?: number }` or `{ playlist: string }`. */
  setQueue(options: Record<string, unknown>): Promise<void>;
  addEventListener(event: MusicKitEvent, handler: () => void): void;
  removeEventListener(event: MusicKitEvent, handler: () => void): void;
  api: {
    music(path: string, params?: Record<string, unknown>): Promise<{ data: { data: MusicKitResource[] } }>;
  };
}

export interface MusicKitGlobal {
  configure(options: {
    developerToken: string;
    app: { name: string; build: string };
    /** Opens straight onto an account the Hub already holds a token for. */
    musicUserToken?: string;
  }): Promise<MusicKitInstance>;
  getInstance(): MusicKitInstance | undefined;
  PlaybackStates: Record<string, number>;
}

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}

const SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

let loading: Promise<MusicKitGlobal> | null = null;

/** A script that never loads must not leave the screen saying "Connecting…" forever. */
const LOAD_TIMEOUT_MS = 15000;

/**
 * Load MusicKit JS once per page.
 *
 * The script announces itself with a `musickitloaded` event on document, so
 * that is the happy path. Both `onload` and a timeout are watched as well: a
 * response that is 200 but is not MusicKit — a captive portal, a proxy error
 * page, a service worker handing back the app shell — fires onload without ever
 * firing `musickitloaded`, and without these the promise never settles.
 */
export function loadMusicKit(): Promise<MusicKitGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("MusicKit needs a browser"));
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (loading) return loading;

  loading = new Promise<MusicKitGlobal>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      document.removeEventListener("musickitloaded", onEvent);
      fn();
    };

    const onEvent = () =>
      finish(() =>
        window.MusicKit
          ? resolve(window.MusicKit)
          : reject(new Error("MusicKit loaded without defining itself")),
      );

    const timer = window.setTimeout(
      () => finish(() => reject(new Error("Apple's MusicKit did not load"))),
      LOAD_TIMEOUT_MS,
    );

    document.addEventListener("musickitloaded", onEvent);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`);
    if (existing) return;

    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    // onload without the global means whatever arrived was not MusicKit.
    script.onload = () => {
      if (window.MusicKit) onEvent();
      else finish(() => reject(new Error("That did not come back as MusicKit")));
    };
    script.onerror = () => finish(() => reject(new Error("Could not reach Apple's MusicKit")));
    document.head.appendChild(script);
  }).catch((e) => {
    // A failed load must not poison every later attempt.
    loading = null;
    throw e;
  });

  return loading;
}

/** Apple's artwork URLs are templates; fill them in or you get a 404. */
export function artworkUrl(artwork: MusicKitArtwork | undefined, size: number): string | null {
  if (!artwork?.url) return null;
  return artwork.url.replace("{w}", String(size)).replace("{h}", String(size));
}
