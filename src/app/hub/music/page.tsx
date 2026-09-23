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
import BrowseOverlay from "./BrowseOverlay";
import { useHub, useHubMusic } from "../HubRuntime";
import { formatTime, type AppleMusic } from "./useAppleMusic";
import { Artwork, ExplicitMark, ListenOnAppleMusic, QrSheet } from "./parts";
import { SLEEP_CHOICES, sleepLabel, type RepeatMode } from "./player";

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
 *
 * The screen is "Music", never "Apple Music": Apple Music is where the music
 * comes from, credited with Apple's own badge on the player and the words
 * "on Apple Music" — never "in", "from" or "Apple Music's". See
 * docs/music/apple-music.md for the rules this follows.
 */
export default function Music() {
  const music = useHubMusic();
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)}>
      <Hero title="Music" eyebrow={eyebrowFor(music)}>
        <span className="flex min-w-0 flex-none items-center gap-2">
          {music.status === "ready" ? (
            <>
              <HeroButton icon="library" label="Browse" onClick={() => setBrowsing(true)} />
              <HeroButton icon="search" label="Search" onClick={() => setSearching(true)} />
            </>
          ) : null}
          {music.status === "ready" || music.status === "unlinked" ? (
            <AccountBar music={music} onAdd={() => setAdding(true)} />
          ) : null}
        </span>
      </Hero>

      {music.status === "ready" ? <Player music={music} /> : <Gate music={music} onAdd={() => setAdding(true)} />}

      <ProblemBar music={music} />

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

      <span className="flex-none px-1 text-[11px] leading-4 text-neutral-400">
        Apple and Apple Music are trademarks of Apple Inc., registered in the U.S. and other countries.
      </span>

      {searching ? <SearchOverlay music={music} onClose={() => setSearching(false)} /> : null}
      {browsing ? <BrowseOverlay music={music} onClose={() => setBrowsing(false)} /> : null}

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
      return "Connecting…";
    case "unconfigured":
      return "Apple Music is not set up on this Hub";
    case "unlinked":
      return "No Apple Music account linked yet";
    case "error":
      return music.error ?? "Apple Music is unavailable";
    default:
      if (music.linking) return "Waiting for Apple…";
      // Browsers will not start audio without a tap, so a restored queue sits
      // ready and says so rather than looking like nothing happened.
      if (!music.online) return "Reconnecting…";
      if (music.resumed && !music.isPlaying) return "Where you left off · press play";
      return `${music.active ?? "Nobody"}'s library · on Apple Music`;
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
  const { room } = useHub();
  const np = music.nowPlaying;
  const progress = np && np.duration > 0 ? (np.elapsed / np.duration) * 100 : 0;
  const [sleepOpen, setSleepOpen] = useState(false);

  return (
    <div className="flex flex-none items-center gap-6 rounded-[20px] bg-surface p-6 shadow-card">
      <Artwork src={np?.artwork ?? null} size={120} radius={20} glyph={40} />

      <span className="flex min-w-0 flex-grow flex-col gap-3">
        <span className="flex items-start justify-between gap-4">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-heading text-xl font-bold leading-7 text-text">
                {np?.title ?? "Nothing playing"}
              </span>
              {np?.explicit ? <ExplicitMark /> : null}
            </span>
            <span className="truncate text-[13px] leading-[18px] text-ink-muted">
              {np?.artist ||
                (music.resumed ? "Picked up where you left off — press play" : "Choose a playlist to start")}
            </span>
          </span>
          <span className="flex flex-none items-center gap-2">
            {/* Apple's credit, while there is something of Apple's playing.
                One badge on this screen, and this is it. */}
            {np ? <ListenOnAppleMusic url={np.url} height={32} /> : null}
            <span
              className="flex flex-none items-center gap-2 rounded-full px-3.5 py-1.5"
              style={{ background: "rgba(59,92,246,0.10)" }}
            >
              <Icon name="home" size={15} className="text-accent" />
              {/* The room this panel actually is, as the household named it —
                  every panel used to call itself the kitchen. */}
              <span className="text-xs font-semibold leading-4 text-text">{room}</span>
            </span>
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
          <span className="w-[42px] flex-none text-right text-xs font-medium leading-4 text-ink-muted tabular-nums">
            {/* Time left, the way every player counts down the end of a song. */}
            -{formatTime(Math.max(0, (np?.duration ?? 0) - (np?.elapsed ?? 0)))}
          </span>
        </span>

        <span className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <Toggle
              label={music.shuffle ? "Shuffle is on" : "Shuffle"}
              on={music.shuffle}
              onClick={music.toggleShuffle}
              icon="shuffle"
            />
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
            <RepeatButton mode={music.repeat} onClick={music.cycleRepeat} />
            <Toggle
              label={music.autoplay ? "Autoplay is on — similar music follows the queue" : "Autoplay similar music"}
              on={music.autoplay}
              onClick={music.toggleAutoplay}
              icon="infinity"
            />
            <span className="relative">
              <Toggle
                label={music.sleep ? `Sleep timer: ${sleepLabel(music.sleep.choice)}` : "Sleep timer"}
                on={!!music.sleep}
                onClick={() => setSleepOpen((o) => !o)}
                icon="moon"
              />
              {sleepOpen ? (
                <SleepMenu
                  music={music}
                  onDone={() => setSleepOpen(false)}
                />
              ) : null}
            </span>
          </span>

          <span
            className="flex w-44 items-center gap-2.5"
            title={
              music.ducked
                ? "Turned down while the house is talking"
                : music.quietCapped
                  ? "Held down during quiet hours"
                  : undefined
            }
          >
            <Icon
              name="speaker"
              size={18}
              className={`flex-none ${music.ducked || music.quietCapped ? "text-accent" : "text-ink-muted"}`}
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

/** Off, all, one — one button, with a "1" when it is looping this song. */
function RepeatButton({ mode, onClick }: { mode: RepeatMode; onClick: () => void }) {
  const on = mode !== "none";
  const label = mode === "one" ? "Repeating this song" : mode === "all" ? "Repeating the queue" : "Repeat";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={`relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-none transition-colors active:scale-[0.97] ${
        on ? "text-white" : "bg-transparent text-ink-muted"
      }`}
      style={on ? { background: "var(--color-accent)" } : undefined}
    >
      <Icon name="repeat" size={20} />
      {mode === "one" ? (
        <span
          aria-hidden
          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold leading-none text-accent"
        >
          1
        </span>
      ) : null}
    </button>
  );
}

function Toggle({
  label,
  on,
  onClick,
  icon,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  icon: "shuffle" | "infinity" | "moon";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-none transition-colors active:scale-[0.97] ${
        on ? "text-white" : "bg-transparent text-ink-muted"
      }`}
      style={on ? { background: "var(--color-accent)" } : undefined}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

/** End of this song, or 15/30/60 minutes. The music fades out rather than cutting. */
function SleepMenu({ music, onDone }: { music: AppleMusic; onDone: () => void }) {
  return (
    <span className="absolute bottom-full left-1/2 z-40 mb-2 flex w-56 -translate-x-1/2 flex-col gap-0.5 rounded-xl bg-surface-2 p-2 shadow-overlay">
      <span className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-neutral-400">
        Stop playing
      </span>
      {SLEEP_CHOICES.map((choice) => {
        const on = music.sleep?.choice === choice;
        return (
          <button
            key={String(choice)}
            type="button"
            aria-pressed={on}
            onClick={() => {
              music.setSleep(choice);
              onDone();
            }}
            className={`flex h-11 cursor-pointer items-center justify-between rounded-lg border-none px-3 text-left text-[13px] font-semibold ${
              on ? "bg-accent text-white" : "bg-transparent text-text"
            }`}
          >
            {sleepLabel(choice)}
            {on && music.sleep?.deadline ? (
              <span className="text-xs font-medium tabular-nums">
                {new Date(music.sleep.deadline).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            ) : null}
          </button>
        );
      })}
      {music.sleep ? (
        <button
          type="button"
          onClick={() => {
            music.setSleep(null);
            onDone();
          }}
          className="flex h-11 cursor-pointer items-center rounded-lg border-none bg-transparent px-3 text-left text-[13px] font-semibold text-ink-muted"
        >
          Turn off the timer
        </button>
      ) : null}
    </span>
  );
}

/**
 * What went wrong, with the way out that fits it.
 *
 * No subscription gets Apple's own offer — as a code, because a wall panel
 * cannot open a browser — rather than a generic error, and the rest of the
 * Hub carries on. A token Apple stopped accepting gets "sign in again", the
 * same door as linking. A song that could not play and was skipped is a
 * passing note, not a failure.
 */
function ProblemBar({ music }: { music: AppleMusic }) {
  const [offer, setOffer] = useState(false);
  const p = music.problem;

  if (!p && !music.notice) return null;

  if (!p) {
    return (
      <span className="flex flex-none items-center gap-2 px-1 text-[13px] leading-[18px] text-ink-muted">
        <Icon name="alert" size={15} className="flex-none text-accent" />
        {music.notice}
      </span>
    );
  }

  return (
    <div className="flex flex-none items-center gap-4 rounded-xl bg-surface px-5 py-3.5 shadow-card">
      <Icon name="alert" size={20} className="flex-none text-accent" />
      <span className="flex min-w-0 flex-grow flex-col">
        <span className="text-[15px] font-semibold leading-5 text-text">
          {p.kind === "subscription" ? "An Apple Music subscription is needed to play here" : p.message}
        </span>
        {p.kind === "subscription" ? (
          <span className="text-[13px] leading-[18px] text-ink-muted">
            {p.message} Everything else on the Hub works as usual.
          </span>
        ) : null}
      </span>
      {p.kind === "subscription" ? (
        <button
          type="button"
          onClick={() => setOffer(true)}
          className="h-11 flex-none cursor-pointer rounded-full border-none bg-accent px-5 text-[13px] font-bold text-white transition-transform active:scale-[0.97]"
        >
          Try Apple Music
        </button>
      ) : null}
      {p.kind === "auth" ? (
        <button
          type="button"
          onClick={music.relink}
          disabled={music.linking}
          className="h-11 flex-none cursor-pointer rounded-full border-none bg-accent px-5 text-[13px] font-bold text-white transition-transform active:scale-[0.97] disabled:opacity-50"
        >
          Sign in again
        </button>
      ) : null}
      <button
        type="button"
        onClick={music.dismissProblem}
        aria-label="Dismiss"
        className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-ink-muted"
      >
        <Icon name="close" size={18} />
      </button>
      {offer ? (
        <QrSheet
          url={music.subscribeUrl}
          title="Try Apple Music"
          body="Scan with your phone to see Apple's subscription offer. Once it's active, press play here again."
          onClose={() => setOffer(false)}
        />
      ) : null}
    </div>
  );
}

function HeroButton({
  icon,
  label,
  onClick,
}: {
  icon: "search" | "library";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 flex-none cursor-pointer items-center gap-2 rounded-full border-none bg-surface px-4 text-[13px] font-semibold text-text transition-transform active:scale-[0.97]"
      style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
    >
      <Icon name={icon} size={16} />
      {label}
    </button>
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
        <span className="font-semibold text-text">{name}</span>&rsquo;s library · on Apple Music
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
