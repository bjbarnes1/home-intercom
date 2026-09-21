"use client";

import { useCallback, useEffect, useState } from "react";
import {
  artworkUrl,
  loadMusicKit,
  type MusicKitInstance,
  type MusicKitResource,
} from "./musickit";

/**
 * Apple Music, wired to the Hub's Music screen.
 *
 * Three states matter and the screen shows all three honestly:
 *   - not configured: the household has no MusicKit credentials on the server
 *   - not signed in:  MusicKit is ready but nobody has authorised an account
 *   - playing:        a real queue, a real position, real artwork
 *
 * Playback happens entirely in this browser. The server mints the developer
 * token and nothing else — no listener token, no library, no history.
 */

export type MusicStatus = "loading" | "unconfigured" | "unauthorized" | "ready" | "error";

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

export interface AppleMusic {
  status: MusicStatus;
  error: string | null;
  isPlaying: boolean;
  nowPlaying: NowPlaying | null;
  playlists: Playlist[];
  recent: Track[];
  volume: number;
  signIn: () => void;
  signOut: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (fraction: number) => void;
  setVolume: (value: number) => void;
  playPlaylist: (id: string) => void;
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
  const [volume, setVolumeState] = useState(0.65);

  // Configure once: fetch the developer token, load MusicKit, hand it over.
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/music/apple/token", { cache: "no-store" });
        const json = (await res.json()) as { configured: boolean; token?: string };
        if (!alive) return;

        if (!json.configured || !json.token) {
          setStatus("unconfigured");
          return;
        }

        const kit = await loadMusicKit();
        const instance = await kit.configure({
          developerToken: json.token,
          app: { name: "famOS Hub", build: "1" },
        });
        if (!alive) return;

        setMusic(instance);
        setVolumeState(instance.volume);
        setStatus(instance.isAuthorized ? "ready" : "unauthorized");
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

    const readState = () => {
      const playingState = window.MusicKit?.PlaybackStates?.playing;
      setPlaying(music.playbackState === playingState);
      readNowPlaying();
    };

    const readTime = () => {
      setNowPlaying((prev) =>
        prev ? { ...prev, elapsed: music.currentPlaybackTime, duration: music.currentPlaybackDuration || prev.duration } : prev,
      );
    };

    const readAuth = () => setStatus(music.isAuthorized ? "ready" : "unauthorized");

    music.addEventListener("playbackStateDidChange", readState);
    music.addEventListener("nowPlayingItemDidChange", readNowPlaying);
    music.addEventListener("playbackTimeDidChange", readTime);
    music.addEventListener("authorizationStatusDidChange", readAuth);
    readState();

    return () => {
      music.removeEventListener("playbackStateDidChange", readState);
      music.removeEventListener("nowPlayingItemDidChange", readNowPlaying);
      music.removeEventListener("playbackTimeDidChange", readTime);
      music.removeEventListener("authorizationStatusDidChange", readAuth);
    };
  }, [music]);

  // The listener's own library, once they have authorised.
  useEffect(() => {
    if (!music || status !== "ready") return;
    let alive = true;

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
  }, [music, status]);

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
    isPlaying,
    nowPlaying,
    playlists,
    recent,
    volume,
    signIn: guard((m) => m.authorize()),
    signOut: guard((m) => m.unauthorize()),
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
