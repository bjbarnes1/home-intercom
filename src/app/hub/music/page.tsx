"use client";

import BaseLayer, { Eyebrow, Hero } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import Avatar from "../_components/Avatar";
import { PEOPLE } from "../data";
import type { Identity } from "@/lib/color/identity";
import { useState } from "react";
import PlayingOn from "./PlayingOn";
import QueueLists from "./QueueLists";
import SearchOverlay from "./SearchOverlay";
import { useHubMusic } from "../HubRuntime";
import { formatTime, type AppleMusic } from "./useAppleMusic";

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
  const music = useHubMusic();
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);

  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)}>
      <Hero title="Music" eyebrow={eyebrowFor(music)}>
        <span className="flex min-w-0 flex-none items-center gap-2">
          {music.status === "ready" ? (
            <button
              type="button"
              onClick={() => setSearching(true)}
              className="flex h-11 flex-none cursor-pointer items-center gap-2 rounded-full border-none bg-surface px-4 text-[13px] font-semibold text-text transition-transform active:scale-[0.97]"
              style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
            >
              <Icon name="search" size={16} />
              Search
            </button>
          ) : null}
          {music.status === "ready" || music.status === "unlinked" ? (
            <AccountBar music={music} onAdd={() => setAdding(true)} />
          ) : null}
        </span>
      </Hero>

      {music.status === "ready" ? <Player music={music} /> : <Gate music={music} onAdd={() => setAdding(true)} />}

      {music.status === "ready" && music.active ? <AccountActions music={music} /> : null}

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

          <QueueLists music={music} />
        </div>

        <PlayingOn music={music} />
      </div>

      {searching ? <SearchOverlay music={music} onClose={() => setSearching(false)} /> : null}

      {adding ? (
        <PersonPicker
          taken={music.accounts.map((a) => a.who)}
          onClose={() => setAdding(false)}
          onPick={(who) => {
            setAdding(false);
            music.link(who);
          }}
        />
      ) : null}
    </BaseLayer>
  );
}

function eyebrowFor(music: AppleMusic): string {
  switch (music.status) {
    case "loading":
      return "Connecting to Apple Music";
    case "unconfigured":
      return "Apple Music is not set up on this Hub";
    case "unlinked":
      return "No Apple Music account linked yet";
    case "error":
      return music.error ?? "Apple Music is unavailable";
    default:
      return music.linking
        ? "Waiting for Apple…"
        : `Apple Music · ${music.active ?? "nobody"}'s library`;
  }
}

/** Everything that is not a working player: one honest sentence and one action. */
function Gate({ music, onAdd }: { music: AppleMusic; onAdd: () => void }) {
  const copy: Record<string, { title: string; body: string }> = {
    loading: { title: "Connecting…", body: "Starting Apple Music on this Hub." },
    unconfigured: {
      title: "Apple Music is not set up",
      body: "Add the MusicKit credentials to this server and the player appears here. Until then there is nothing to play.",
    },
    unlinked: {
      title: "Link an Apple Music account",
      body: "Everyone signs in with their own Apple ID, so the Hub plays your library and your playlists rather than a shared account. An Apple Music subscription is required.",
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
      {music.status === "unlinked" ? (
        <button
          type="button"
          onClick={onAdd}
          className="h-13 flex-none cursor-pointer rounded-full border-none bg-accent px-7 text-sm font-bold text-white transition-transform active:scale-[0.97]"
        >
          Link an account
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
            <button
              type="button"
              aria-label="Repeat this song"
              aria-pressed={music.repeatOne}
              onClick={music.toggleRepeatOne}
              className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-none transition-colors active:scale-[0.97] ${
                music.repeatOne ? "text-white" : "bg-transparent text-ink-muted"
              }`}
              style={music.repeatOne ? { background: "var(--color-accent)" } : undefined}
            >
              <Icon name="repeat" size={20} />
            </button>
          </span>

          <span className="flex w-44 items-center gap-2.5" title={music.ducked ? "Turned down while the house is talking" : undefined}>
            <Icon
              name="speaker"
              size={18}
              className={`flex-none ${music.ducked ? "text-accent" : "text-ink-muted"}`}
            />
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

/**
 * Whose account is playing.
 *
 * The public player is a shared object, so the selector is right here rather
 * than behind a settings screen: anyone at the Hub can put their own library on
 * without signing into anything else. A ring marks the account the Hub opens on.
 */
function AccountBar({ music, onAdd }: { music: AppleMusic; onAdd: () => void }) {
  const name = (who: Identity) => PEOPLE.find((p) => p.key === who)?.name ?? who;

  return (
    <span className="flex min-w-0 flex-none items-center gap-2">
      {music.accounts.map((a) => {
        const on = a.who === music.active;
        return (
          <button
            key={a.who}
            type="button"
            aria-pressed={on}
            onClick={() => music.switchTo(a.who)}
            title={a.who === music.defaultWho ? `${name(a.who)} — opens here by default` : name(a.who)}
            className={`flex h-11 cursor-pointer items-center gap-2 rounded-full border-none py-1.5 pl-1.5 pr-4 transition-transform active:scale-[0.97] ${
              on ? "bg-accent" : "bg-surface shadow-card"
            }`}
          >
            <Avatar
              who={a.who}
              size={32}
              ring={a.who === music.defaultWho ? (on ? "rgba(255,255,255,0.9)" : "var(--color-accent)") : undefined}
            />
            <span className={`text-[13px] font-semibold ${on ? "text-white" : "text-text"}`}>{name(a.who)}</span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onAdd}
        disabled={music.linking}
        aria-label="Link another Apple Music account"
        className="flex h-11 cursor-pointer items-center gap-2 rounded-full border-none bg-surface px-4 text-[13px] font-semibold text-text transition-transform active:scale-[0.97] disabled:opacity-50"
        style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
      >
        <Icon name="plus" size={16} />
        {music.accounts.length ? "Add" : "Link an account"}
      </button>
    </span>
  );
}

/** Which household member is about to sign in — Apple only knows about Apple IDs. */
function PersonPicker({
  taken,
  onClose,
  onPick,
}: {
  taken: Identity[];
  onClose: () => void;
  onPick: (who: Identity) => void;
}) {
  const available = PEOPLE.filter((p) => !taken.includes(p.key));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex w-[560px] max-w-full flex-col gap-4 rounded-[24px] bg-surface-2 p-6 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex flex-col gap-1">
          <span className="font-heading text-xl font-bold leading-7 text-text">Who is signing in?</span>
          <span className="text-[13px] leading-[18px] text-ink-muted">
            Apple will ask for that person&rsquo;s own Apple ID next.
          </span>
        </span>

        <div className="grid grid-cols-3 gap-3">
          {available.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onPick(p.key)}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-none bg-surface p-4 shadow-card transition-transform active:scale-[0.97]"
            >
              <Avatar who={p.key} size={48} />
              <span className="text-[13px] font-semibold leading-[18px] text-text">{p.name}</span>
            </button>
          ))}
          {!available.length ? (
            <span className="col-span-3 py-2 text-[13px] leading-[18px] text-ink-muted">
              Everyone in the house has already linked an account.
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="h-12 cursor-pointer self-center rounded-full border-none bg-surface px-8 text-sm font-bold text-text transition-transform active:scale-[0.97]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** What can be done with the account currently playing. Quiet until it is wanted. */
function AccountActions({ music }: { music: AppleMusic }) {
  const who = music.active;
  if (!who) return null;
  const name = PEOPLE.find((p) => p.key === who)?.name ?? who;
  const isDefault = who === music.defaultWho;

  return (
    <div className="flex flex-none items-center gap-3 px-1">
      <span className="text-[13px] leading-[18px] text-ink-muted">
        Playing from <span className="font-semibold text-text">{name}</span>&rsquo;s Apple Music
        {isDefault ? " · opens here by default" : null}
      </span>

      {!isDefault ? (
        <button
          type="button"
          onClick={() => music.makeDefault(who)}
          className="h-8 cursor-pointer rounded-full border-none bg-transparent px-3 text-[13px] font-semibold text-accent transition-transform active:scale-[0.97]"
        >
          Make default
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => music.forget(who)}
        className="ml-auto h-8 cursor-pointer rounded-full border-none bg-transparent px-3 text-[13px] font-semibold text-ink-muted transition-transform active:scale-[0.97]"
      >
        Forget this account
      </button>
    </div>
  );
}
