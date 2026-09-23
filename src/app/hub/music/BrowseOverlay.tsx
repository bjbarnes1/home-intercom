"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "../_components/Icon";
import type { AppleMusic, MusicItem } from "./useAppleMusic";
import { ItemRow } from "./SearchOverlay";

/**
 * Something to play without knowing what.
 *
 * A family screen gets asked to "just play something good" far more than it
 * gets a title typed into it, and every smart display answers that with one
 * tap. So: what Apple picks for this listener, what they have had on
 * repeat, radio, the charts — and their whole library, a page at a time,
 * rather than the five playlists the Music screen has room for.
 *
 * All of it is read live from Apple each time it is opened and never kept;
 * see docs/music/apple-music.md on what the Hub may hold.
 */

type Tab = "for-you" | "radio" | "charts" | "library";
type LibraryKind = "playlists" | "albums" | "artists" | "songs";

const TABS: { key: Tab; label: string }[] = [
  { key: "for-you", label: "For you" },
  { key: "radio", label: "Radio" },
  { key: "charts", label: "Charts" },
  { key: "library", label: "Library" },
];

const LIBRARY_KINDS: { key: LibraryKind; label: string }[] = [
  { key: "playlists", label: "Playlists" },
  { key: "albums", label: "Albums" },
  { key: "artists", label: "Artists" },
  { key: "songs", label: "Songs" },
];

interface Shelf {
  title: string;
  items: MusicItem[];
}

export default function BrowseOverlay({ music, onClose }: { music: AppleMusic; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("for-you");
  const [kind, setKind] = useState<LibraryKind>("playlists");
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const browse = music.browse;

  useEffect(() => {
    let alive = true;
    setShelves(null);
    setNext(null);

    void (async () => {
      let found: Shelf[] = [];
      if (tab === "for-you") {
        const [groups, rotation] = await Promise.all([browse.forYou(), browse.heavyRotation()]);
        found = [...(rotation.length ? [{ title: "On repeat", items: rotation }] : []), ...groups];
      } else if (tab === "radio") {
        const { personal, live } = await browse.stations();
        found = [
          ...(personal ? [{ title: "Your station", items: [personal] }] : []),
          ...(live.length ? [{ title: "Apple Music Radio", items: live }] : []),
        ];
      } else if (tab === "charts") {
        const c = await browse.charts();
        found = [
          { title: "Top songs", items: c.songs },
          { title: "Top albums", items: c.albums },
          { title: "Top playlists", items: c.playlists },
        ].filter((s) => s.items.length);
      } else {
        const page = await browse.library(kind, 0);
        found = [{ title: LIBRARY_KINDS.find((k) => k.key === kind)?.label ?? "", items: page.items }];
        if (alive) setNext(page.next);
      }
      if (alive) setShelves(found);
    })();

    return () => {
      alive = false;
    };
    // browse is rebuilt every render; the tab and kind are what change the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kind]);

  const more = useCallback(async () => {
    if (next == null || loadingMore) return;
    setLoadingMore(true);
    const page = await browse.library(kind, next);
    setShelves((prev) => (prev ? [{ ...prev[0], items: [...prev[0].items, ...page.items] }] : prev));
    setNext(page.next);
    setLoadingMore(false);
  }, [browse, kind, next, loadingMore]);

  const play = (item: MusicItem) => {
    music.playItem(item);
    onClose();
  };

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
        <span className="flex flex-none items-center gap-2">
          {TABS.map((t) => (
            <Pill key={t.key} on={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </Pill>
          ))}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close browse"
            className="ml-auto flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-ink-muted"
          >
            <Icon name="close" size={18} />
          </button>
        </span>

        {tab === "library" ? (
          <span className="flex flex-none items-center gap-2">
            {LIBRARY_KINDS.map((k) => (
              <Pill key={k.key} on={kind === k.key} onClick={() => setKind(k.key)} small>
                {k.label}
              </Pill>
            ))}
          </span>
        ) : null}

        <div className="flex min-h-0 flex-grow flex-col gap-4 overflow-y-auto">
          {shelves === null ? (
            <span className="px-2 py-3 text-[13px] leading-[18px] text-ink-muted">Loading…</span>
          ) : !shelves.some((s) => s.items.length) ? (
            <span className="px-2 py-3 text-[13px] leading-[18px] text-ink-muted">
              {tab === "library" ? "Nothing here in this library yet." : "Apple Music has nothing to show here right now."}
            </span>
          ) : (
            shelves.map((shelf) => (
              <div key={shelf.title} className="flex flex-col gap-1">
                <span className="px-2 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-neutral-400">
                  {shelf.title}
                </span>
                {shelf.items.map((item) => (
                  <ItemRow key={`${item.kind}-${item.id}`} item={item} music={music} onPlay={play} />
                ))}
              </div>
            ))
          )}

          {tab === "library" && next != null ? (
            <button
              type="button"
              onClick={more}
              disabled={loadingMore}
              className="h-11 flex-none cursor-pointer self-center rounded-full border-none bg-surface px-6 text-[13px] font-semibold text-text shadow-card transition-transform active:scale-[0.97] disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Show more"}
            </button>
          ) : null}

          {music.cleanOnly ? (
            <span className="px-2 text-xs leading-4 text-ink-muted">Explicit music is hidden on this Hub.</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Pill({
  on,
  onClick,
  small,
  children,
}: {
  on: boolean;
  onClick: () => void;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`${small ? "h-9 px-3.5" : "h-11 px-5"} cursor-pointer rounded-full border-none text-[13px] font-semibold transition-transform active:scale-[0.97] ${
        on ? "bg-accent text-white" : "bg-surface text-text shadow-card"
      }`}
    >
      {children}
    </button>
  );
}
