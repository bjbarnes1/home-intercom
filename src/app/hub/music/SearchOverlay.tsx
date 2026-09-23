"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../_components/Icon";
import { EMPTY_RESULTS } from "@/lib/music/appleApi";
import type { AppleMusic, CatalogResults, MusicItem } from "./useAppleMusic";
import { Artwork, ExplicitMark } from "./parts";

/**
 * Finding something to play.
 *
 * Grouped the way every player groups it — the best match first, then songs,
 * albums, artists, playlists and stations — because "play the new album" is
 * the request people make most, and a list of songs alone cannot answer it.
 *
 * Songs offer the two things MusicKit actually supports doing to a queue —
 * next, or at the end — rather than a generic "add" that has to pick one
 * silently. Everything else replaces the queue, because that is what choosing
 * an album or a playlist has always meant. An artist plays their top songs.
 *
 * Typing on a wall touchscreen is slow, so suggestions come up as you type
 * and this person's recent searches are there before you start. Those stay on
 * this panel, per person.
 *
 * A clean-only panel never shows an explicit result at all.
 */
export default function SearchOverlay({
  music,
  onClose,
}: {
  music: AppleMusic;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [where, setWhere] = useState<"catalog" | "library">("catalog");
  const [results, setResults] = useState<CatalogResults>(EMPTY_RESULTS);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  /** A search that errored, so it does not masquerade as "nothing found". */
  const [failed, setFailed] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults(EMPTY_RESULTS);
      setSuggestions([]);
      return;
    }
    // Wait for a pause rather than searching Apple's catalogue on every letter.
    const id = window.setTimeout(async () => {
      setBusy(true);
      setFailed(null);
      const [found, suggested] = await Promise.all([
        music.search(term, where),
        where === "catalog" ? music.suggest(term) : Promise.resolve([]),
      ]);
      setResults(found);
      setSuggestions(suggested.filter((s) => s.toLowerCase() !== term.trim().toLowerCase()).slice(0, 5));
      if (isEmpty(found) && music.error) setFailed(music.error);
      setBusy(false);
    }, 350);
    return () => window.clearTimeout(id);
  }, [term, where, music]);

  const remember = () => music.rememberSearch(term);
  const play = (item: MusicItem) => {
    remember();
    music.playItem(item);
    onClose();
  };

  const nothing = isEmpty(results);
  const typing = term.trim().length >= 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-8 pt-16"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[760px] max-w-full flex-col gap-3 rounded-[24px] bg-surface-2 p-6 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex flex-none items-center gap-3 rounded-full bg-bg px-5 py-3">
          <Icon name="search" size={18} className="flex-none text-ink-muted" />
          <input
            ref={input}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") remember();
            }}
            placeholder={where === "catalog" ? "Songs, albums, artists, playlists" : "Search your library"}
            aria-label={where === "catalog" ? "Search on Apple Music" : "Search your library"}
            className="min-w-0 flex-grow border-none bg-transparent text-base leading-6 text-text outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center border-none bg-transparent text-ink-muted"
          >
            <Icon name="close" size={18} />
          </button>
        </span>

        <span className="flex flex-none items-center gap-2">
          <Segment on={where === "catalog"} onClick={() => setWhere("catalog")}>
            On Apple Music
          </Segment>
          <Segment on={where === "library"} onClick={() => setWhere("library")}>
            {music.active ? `${music.active}'s library` : "Your library"}
          </Segment>
          {music.cleanOnly ? (
            <span className="ml-auto text-xs leading-4 text-ink-muted">Explicit results are hidden on this Hub</span>
          ) : null}
        </span>

        {/* Before typing: this person's recent searches. While typing: Apple's suggestions. */}
        {!typing && music.recentSearches.length ? (
          <Chips label="Recent" items={music.recentSearches} onPick={setTerm} />
        ) : null}
        {typing && suggestions.length ? <Chips label="Try" items={suggestions} onPick={setTerm} /> : null}

        <div className="flex min-h-0 flex-grow flex-col gap-4 overflow-y-auto">
          <Section title="Top results" items={results.top} music={music} onPlay={play} onQueue={remember} />
          <Section title="Songs" items={results.songs} music={music} onPlay={play} onQueue={remember} />
          <Section title="Albums" items={results.albums} music={music} onPlay={play} onQueue={remember} />
          <Section title="Artists" items={results.artists} music={music} onPlay={play} onQueue={remember} />
          <Section title="Playlists" items={results.playlists} music={music} onPlay={play} onQueue={remember} />
          <Section title="Stations" items={results.stations} music={music} onPlay={play} onQueue={remember} />

          {nothing ? (
            <span className="px-2 py-3 text-[13px] leading-[18px] text-ink-muted">
              {busy
                ? "Looking…"
                : !typing
                  ? "Type at least two letters."
                  : failed
                    ? failed
                    : "Nothing found."}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function isEmpty(r: CatalogResults): boolean {
  return !r.top.length && !r.songs.length && !r.albums.length && !r.artists.length && !r.playlists.length && !r.stations.length;
}

function Section({
  title,
  items,
  music,
  onPlay,
  onQueue,
}: {
  title: string;
  items: MusicItem[];
  music: AppleMusic;
  onPlay: (item: MusicItem) => void;
  onQueue: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-neutral-400">
        {title}
      </span>
      {items.map((item) => (
        <ItemRow key={`${item.kind}-${item.id}`} item={item} music={music} onPlay={onPlay} onQueue={onQueue} />
      ))}
    </div>
  );
}

/** One result, with the actions that make sense for its kind. Shared with Browse. */
export function ItemRow({
  item,
  music,
  onPlay,
  onQueue,
}: {
  item: MusicItem;
  music: AppleMusic;
  onPlay: (item: MusicItem) => void;
  onQueue?: () => void;
}) {
  // A library song is loved by its catalog id; one with none cannot be.
  const loveId = item.kind === "song" ? (item.library ? item.catalogId : item.id) : null;
  const queueId = item.kind === "song" ? (item.library ? (item.catalogId ?? item.id) : item.id) : null;

  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
      <Artwork src={item.artwork} size={44} radius={item.kind === "artist" ? 22 : 10} glyph={17} />
      <span className="flex min-w-0 flex-grow flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold leading-5 text-text">{item.title}</span>
          {item.contentRating === "explicit" ? <ExplicitMark /> : null}
        </span>
        <span className="truncate text-[13px] leading-[18px] text-ink-muted">
          {[kindLabel(item), item.subtitle].filter(Boolean).join(" · ")}
        </span>
      </span>
      {loveId ? <Heart music={music} kind="songs" id={loveId} /> : null}
      {queueId ? (
        <>
          <Action
            label="Next"
            onClick={() => {
              onQueue?.();
              music.queueNext(queueId);
            }}
          />
          <Action
            label="Queue"
            onClick={() => {
              onQueue?.();
              music.queueLater(queueId);
            }}
          />
        </>
      ) : null}
      <Action label={item.kind === "artist" ? "Top songs" : "Play"} onClick={() => onPlay(item)} primary />
    </div>
  );
}

function kindLabel(item: MusicItem): string {
  switch (item.kind) {
    case "album":
      return "Album";
    case "artist":
      return "Artist";
    case "playlist":
      return "Playlist";
    case "station":
      return item.live ? "Live radio" : "Station";
    default:
      return "";
  }
}

function Chips({ label, items, onPick }: { label: string; items: string[]; onPick: (t: string) => void }) {
  return (
    <span className="flex flex-none flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-neutral-400">{label}</span>
      {items.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onPick(t)}
          className="h-9 cursor-pointer rounded-full border-none bg-surface px-3.5 text-[13px] font-semibold text-text shadow-card transition-transform active:scale-[0.97]"
        >
          {t}
        </button>
      ))}
    </span>
  );
}

function Segment({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 cursor-pointer rounded-full border-none px-4 text-[13px] font-semibold transition-transform active:scale-[0.97] ${
        on ? "bg-accent text-white" : "bg-surface text-text shadow-card"
      }`}
    >
      {children}
    </button>
  );
}

export function Heart({
  music,
  kind,
  id,
}: {
  music: AppleMusic;
  kind: "songs" | "playlists";
  id: string;
}) {
  const on = music.loved.has(id);
  return (
    <button
      type="button"
      aria-label={on ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={on}
      onClick={() => music.toggleLove(kind, id)}
      className={`flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent transition-transform active:scale-[0.97] ${
        on ? "text-accent" : "text-ink-muted"
      }`}
    >
      <Icon name="heart" size={18} strokeWidth={on ? 2.6 : 2} />
    </button>
  );
}

export function Action({
  label,
  onClick,
  primary,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 flex-none cursor-pointer rounded-full border-none px-4 text-[13px] font-semibold transition-transform active:scale-[0.97] ${
        primary ? "bg-accent text-white" : "bg-surface text-text shadow-card"
      }`}
    >
      {label}
    </button>
  );
}
