"use client";

import { ident } from "@/lib/color/identity";
import BaseLayer, { Eyebrow, Hero } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import { PEOPLE, SPEAKERS } from "../data";
import { useState } from "react";
import { formatTime, useAppleMusic, type AppleMusic } from "./useAppleMusic";

/**
 * Music — what is playing, and where.
 *
 * Playback is Apple Music, running in this browser through MusicKit. The screen
 * never invents state: if there is no queue it says so, if nobody has signed in
 * it offers the door, and if the household has no Apple Music credentials it
 * says that instead of showing a player that cannot play.
 *
 * "Playing on" stays ours — which rooms a track goes to is the house's routing,
 * not Apple's.
 */
export default function Music() {
  const music = useAppleMusic();

  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)}>
      <Hero title="Music" eyebrow={eyebrowFor(music)}>
        {music.status === "ready" ? (
          <button
            type="button"
            onClick={music.signOut}
            className="h-11 flex-none cursor-pointer rounded-full border-none bg-surface px-[18px] text-[13px] font-semibold text-text shadow-card transition-transform active:scale-[0.97]"
          >
            Sign out of Apple Music
          </button>
        ) : null}
      </Hero>

      {music.status === "ready" ? <Player music={music} /> : <Gate music={music} />}

      <div className="flex min-h-0 flex-grow gap-5">
        <div className="flex min-w-0 flex-grow flex-col gap-2">
          <span className="px-1">
            <Eyebrow tone="ink">Your playlists</Eyebrow>
          </span>
          <div className="grid flex-none grid-cols-5 gap-3">
            {music.playlists.slice(0, 5).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => music.playPlaylist(p.id)}
                className="flex h-[100px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-none bg-surface shadow-card transition-transform active:scale-[0.97]"
              >
                <Artwork src={p.artwork} size={40} radius={12} glyph={19} />
                <span className="truncate px-2 text-center text-[13px] font-semibold leading-[18px] text-text">
                  {p.name}
                </span>
              </button>
            ))}
            {!music.playlists.length ? (
              <span className="col-span-5 flex h-[100px] items-center rounded-xl bg-surface px-5 text-[13px] leading-[18px] text-ink-muted shadow-card">
                {music.status === "ready"
                  ? "No playlists in this Apple Music library yet."
                  : "Your Apple Music playlists appear here once the Hub is signed in."}
              </span>
            ) : null}
          </div>

          <span className="px-1 pt-2">
            <Eyebrow tone="ink">Recently played</Eyebrow>
          </span>
          <div className="flex min-h-0 flex-grow flex-col gap-0.5 overflow-y-auto rounded-xl bg-surface p-2 shadow-card">
            {music.recent.map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-3.5 rounded-xl px-3 py-2 text-left"
              >
                <span
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                  style={{ background: "rgba(59,92,246,0.10)" }}
                >
                  <Icon name="music" size={17} className="text-accent" />
                </span>
                <span className="flex min-w-0 flex-grow flex-col">
                  <span className="truncate text-[13px] font-semibold leading-[18px] text-text">{t.title}</span>
                  <span className="truncate text-xs leading-4 text-ink-muted">{t.artist}</span>
                </span>
                <span className="flex-none text-xs font-medium leading-4 text-ink-muted tabular-nums">{t.length}</span>
              </span>
            ))}
            {!music.recent.length ? (
              <span className="px-3 py-3 text-[13px] leading-[18px] text-ink-muted">
                Nothing played on this Hub yet.
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex w-[300px] min-w-0 flex-none flex-col gap-2 max-[1200px]:w-[240px]">
          <span className="px-1">
            <Eyebrow tone="ink">Playing on</Eyebrow>
          </span>
          <div className="flex min-h-0 flex-grow flex-col gap-1 overflow-y-auto rounded-xl bg-surface p-2 shadow-card">
            {SPEAKERS.map((s) => (
              <button
                key={s.name}
                type="button"
                aria-pressed={!!s.playing && music.isPlaying}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-none px-3.5 py-2.5 text-left transition-colors ${
                  s.playing && music.isPlaying ? "" : "bg-transparent hover:bg-bg"
                }`}
                style={s.playing && music.isPlaying ? { background: "var(--color-accent)" } : undefined}
              >
                <span
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-xl"
                  style={{
                    background: s.playing && music.isPlaying ? "rgba(255,255,255,0.22)" : "rgba(59,92,246,0.10)",
                    color: s.playing && music.isPlaying ? "#FFFFFF" : s.key ? ident(s.key) : "var(--color-accent)",
                  }}
                >
                  <Icon name="speaker" size={17} />
                </span>
                <span className="flex min-w-0 flex-grow flex-col">
                  <span className={`truncate text-[13px] font-semibold leading-[18px] ${s.playing && music.isPlaying ? "text-white" : "text-text"}`}>
                    {s.name}
                  </span>
                  <span className={`truncate text-xs leading-4 ${s.playing && music.isPlaying ? "text-white" : "text-ink-muted"}`}>
                    {s.playing && !music.isPlaying ? "Available" : s.where}
                  </span>
                </span>
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: s.playing && music.isPlaying ? "#FFFFFF" : "rgba(15,23,42,0.18)" }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </BaseLayer>
  );
}

function eyebrowFor(music: AppleMusic): string {
  switch (music.status) {
    case "loading":
      return "Connecting to Apple Music";
    case "unconfigured":
      return "Apple Music is not set up on this Hub";
    case "unauthorized":
      return "Sign in to play";
    case "error":
      return music.error ?? "Apple Music is unavailable";
    default:
      return "Apple Music · playing across the house";
  }
}

/** Everything that is not a working player: one honest sentence and one action. */
function Gate({ music }: { music: AppleMusic }) {
  const copy: Record<string, { title: string; body: string }> = {
    loading: { title: "Connecting…", body: "Starting Apple Music on this Hub." },
    unconfigured: {
      title: "Apple Music is not set up",
      body: "Add the MusicKit credentials to this server and the player appears here. Until then there is nothing to play.",
    },
    unauthorized: {
      title: "Sign in to Apple Music",
      body: "The Hub plays from the household's own Apple Music account. An Apple Music subscription is required.",
    },
    error: { title: "Apple Music is unavailable", body: music.error ?? "Something went wrong starting playback." },
  };
  const { title, body } = copy[music.status] ?? copy.error;

  return (
    <div className="flex flex-none items-center gap-6 rounded-[20px] bg-surface p-6 shadow-card">
      <span
        className="flex h-[120px] w-[120px] flex-none items-center justify-center rounded-[20px]"
        style={{ background: "rgba(59,92,246,0.10)" }}
      >
        <Icon name="music" size={40} className="text-accent" />
      </span>
      <span className="flex min-w-0 flex-grow flex-col gap-1.5">
        <span className="font-heading text-xl font-bold leading-7 text-text">{title}</span>
        <span className="max-w-[560px] text-[15px] leading-5 text-ink-muted">{body}</span>
      </span>
      {music.status === "unauthorized" ? (
        <button
          type="button"
          onClick={music.signIn}
          className="h-13 flex-none cursor-pointer rounded-full border-none bg-accent px-7 text-sm font-bold text-white transition-transform active:scale-[0.97]"
        >
          Sign in
        </button>
      ) : null}
    </div>
  );
}

function Player({ music }: { music: AppleMusic }) {
  const np = music.nowPlaying;
  const progress = np && np.duration > 0 ? (np.elapsed / np.duration) * 100 : 0;

  return (
    <div className="flex flex-none items-center gap-6 rounded-[20px] bg-surface p-6 shadow-card">
      <Artwork src={np?.artwork ?? null} size={120} radius={20} glyph={40} />

      <span className="flex min-w-0 flex-grow flex-col gap-3">
        <span className="flex items-start justify-between gap-4">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-heading text-xl font-bold leading-7 text-text">
              {np?.title ?? "Nothing playing"}
            </span>
            <span className="truncate text-[13px] leading-[18px] text-ink-muted">
              {np?.artist || "Choose a playlist to start"}
            </span>
          </span>
          <span
            className="flex flex-none items-center gap-2 rounded-full px-3.5 py-1.5"
            style={{ background: "rgba(59,92,246,0.10)" }}
          >
            <Icon name="home" size={15} className="text-accent" />
            <span className="text-xs font-semibold leading-4 text-text">Kitchen Hub</span>
          </span>
        </span>

        <span className="flex items-center gap-3">
          <span className="w-[34px] flex-none text-xs font-medium leading-4 text-ink-muted tabular-nums">
            {formatTime(np?.elapsed ?? 0)}
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={progress}
            disabled={!np}
            aria-label="Playback position"
            onChange={(e) => music.seek(Number(e.target.value) / 100)}
            className="h-1.5 flex-grow cursor-pointer appearance-none rounded-full"
            style={{
              background: `linear-gradient(to right, var(--color-accent) ${progress}%, rgba(15,23,42,0.08) ${progress}%)`,
            }}
          />
          <span className="w-[34px] flex-none text-right text-xs font-medium leading-4 text-ink-muted tabular-nums">
            {formatTime(np?.duration ?? 0)}
          </span>
        </span>

        <span className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <Transport label="Previous track" icon="prev" onClick={music.previous} />
            <button
              type="button"
              aria-label={music.isPlaying ? "Pause" : "Play"}
              onClick={music.toggle}
              className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-none bg-accent text-white transition-transform active:scale-[0.97]"
            >
              <Icon name={music.isPlaying ? "pause" : "play"} size={22} />
            </button>
            <Transport label="Next track" icon="next" onClick={music.next} />
          </span>

          <span className="flex w-44 items-center gap-2.5">
            <Icon name="speaker" size={18} className="flex-none text-ink-muted" />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(music.volume * 100)}
              aria-label="Volume"
              onChange={(e) => music.setVolume(Number(e.target.value) / 100)}
              className="h-1.5 flex-grow cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, var(--color-accent) ${music.volume * 100}%, rgba(15,23,42,0.08) ${music.volume * 100}%)`,
              }}
            />
          </span>
        </span>
      </span>
    </div>
  );
}

function Transport({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: "prev" | "next";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-text transition-transform active:scale-[0.97]"
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

/**
 * Album art, with the glyph as the floor.
 *
 * Apple's artwork URLs are templated and can 404 for a library item whose art
 * has not been rendered yet — a broken-image box on a wall display is worse
 * than no art at all, so a failed load falls back rather than showing one.
 */
function Artwork({
  src,
  size,
  radius,
  glyph,
}: {
  src: string | null;
  size: number;
  radius: number;
  glyph: number;
}) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        className="flex-none object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label="No artwork"
      className="flex flex-none items-center justify-center"
      style={{ width: size, height: size, borderRadius: radius, background: "rgba(59,92,246,0.10)" }}
    >
      <Icon name="music" size={glyph} className="text-accent" />
    </span>
  );
}
