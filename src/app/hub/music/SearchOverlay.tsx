"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "../_components/Icon";
import type { AppleMusic, SearchResults } from "./useAppleMusic";

/**
 * Finding something to play.
 *
 * Results offer the two things MusicKit actually supports doing to a queue —
 * next, or at the end — rather than a generic "add" that has to pick one
 * silently. A playlist replaces the queue, because that is what choosing a
 * playlist has always meant.
 */
export default function SearchOverlay({
  music,
  onClose,
}: {
  music: AppleMusic;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResults>({ songs: [], playlists: [] });
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults({ songs: [], playlists: [] });
      return;
    }
    // Typing on a touch keyboard is slow; wait for a pause rather than
    // searching Apple's catalogue on every letter.
    const id = window.setTimeout(async () => {
      setBusy(true);
      setResults(await music.search(term));
      setBusy(false);
    }, 350);
    return () => window.clearTimeout(id);
  }, [term, music]);

  const nothing = !results.songs.length && !results.playlists.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-8 pt-20"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-[720px] max-w-full flex-col gap-3 rounded-[24px] bg-surface-2 p-6 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex flex-none items-center gap-3 rounded-full bg-bg px-5 py-3">
          <Icon name="search" size={18} className="flex-none text-ink-muted" />
          <input
            ref={input}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Songs and playlists"
            aria-label="Search Apple Music"
            className="min-w-0 flex-grow border-none bg-transparent text-base leading-6 text-text outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex-none cursor-pointer border-none bg-transparent text-ink-muted"
          >
            <Icon name="close" size={18} />
          </button>
        </span>

        <div className="flex min-h-0 flex-grow flex-col gap-4 overflow-y-auto">
          {results.playlists.length ? (
            <div className="flex flex-col gap-1">
              <span className="px-2 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-neutral-400">
                Playlists
              </span>
              {results.playlists.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                    style={{ background: "rgba(59,92,246,0.10)" }}
                  >
                    <Icon name="music" size={17} className="text-accent" />
                  </span>
                  <span className="min-w-0 flex-grow truncate text-[15px] font-semibold leading-5 text-text">
                    {p.name}
                  </span>
                  <Heart music={music} kind="playlists" id={p.id} />
                  <Action
                    label="Play"
                    onClick={() => {
                      music.playPlaylist(p.id);
                      onClose();
                    }}
                    primary
                  />
                </div>
              ))}
            </div>
          ) : null}

          {results.songs.length ? (
            <div className="flex flex-col gap-1">
              <span className="px-2 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-neutral-400">
                Songs
              </span>
              {results.songs.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <span
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                    style={{ background: "rgba(59,92,246,0.10)" }}
                  >
                    <Icon name="music" size={17} className="text-accent" />
                  </span>
                  <span className="flex min-w-0 flex-grow flex-col">
                    <span className="truncate text-[15px] font-semibold leading-5 text-text">{t.title}</span>
                    <span className="truncate text-[13px] leading-[18px] text-ink-muted">{t.artist}</span>
                  </span>
                  <span className="flex-none text-xs leading-4 text-ink-muted tabular-nums">{t.length}</span>
                  <Heart music={music} kind="songs" id={t.id} />
                  <Action label="Next" onClick={() => music.queueNext(t.id)} />
                  <Action label="Queue" onClick={() => music.queueLater(t.id)} primary />
                </div>
              ))}
            </div>
          ) : null}

          {nothing ? (
            <span className="px-2 py-3 text-[13px] leading-[18px] text-ink-muted">
              {busy
                ? "Looking…"
                : term.trim().length < 2
                  ? "Type at least two letters."
                  : "Nothing found."}
            </span>
          ) : null}
        </div>
      </div>
    </div>
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
      className={`flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent transition-transform active:scale-[0.97] ${
        on ? "text-accent" : "text-ink-muted"
      }`}
    >
      <Icon name="heart" size={18} strokeWidth={on ? 2.6 : 2} />
    </button>
  );
}

function Action({
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
      className={`h-9 flex-none cursor-pointer rounded-full border-none px-4 text-[13px] font-semibold transition-transform active:scale-[0.97] ${
        primary ? "bg-accent text-white" : "bg-surface text-text shadow-card"
      }`}
    >
      {label}
    </button>
  );
}
