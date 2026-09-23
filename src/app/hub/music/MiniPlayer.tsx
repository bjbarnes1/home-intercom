"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "../_components/Icon";
import { useHubMusic } from "../HubRuntime";
import { Artwork, ExplicitMark } from "./parts";

/**
 * What is playing, on every screen.
 *
 * The music session runs for the whole panel — a handoff can arrive while the
 * Hub is showing the clock — but until now you could only see or stop it from
 * the Music screen. Every smart display keeps it one tap away wherever you
 * are, so this does: a bar at the foot of each screen while there is
 * something to show, and gone when there is not.
 *
 * On the home screen it is larger, with the artwork: the ambient view is where
 * the Hub is looked at from across a room, and what is playing is one of the
 * few things worth seeing from there.
 *
 * Not shown on the Music screen itself, which is the full version of this.
 */
export default function MiniPlayer() {
  const music = useHubMusic();
  const path = usePathname();
  const np = music.nowPlaying;

  if (!np || music.status !== "ready" || path?.startsWith("/hub/music")) return null;
  const ambient = path === "/hub";

  return (
    <div
      className={`flex flex-none items-center gap-3 rounded-[20px] bg-surface shadow-card ${
        ambient ? "p-3 pr-4" : "px-3 py-2"
      }`}
    >
      <Link
        href="/hub/music"
        aria-label={`${np.title} — open Music`}
        className="flex min-w-0 flex-grow items-center gap-3"
      >
        <Artwork src={np.artwork} size={ambient ? 64 : 44} radius={ambient ? 14 : 10} glyph={ambient ? 24 : 17} />
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={`truncate font-semibold text-text ${ambient ? "font-heading text-lg leading-6" : "text-[13px] leading-[18px]"}`}
            >
              {np.title}
            </span>
            {np.explicit ? <ExplicitMark /> : null}
          </span>
          {/* Credit where it is due, in words: the badge lives on the player. */}
          <span className="truncate text-xs leading-4 text-ink-muted">
            {[np.artist, "on Apple Music"].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Link>

      <button
        type="button"
        aria-label="Previous track"
        onClick={music.previous}
        className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-text"
      >
        <Icon name="prev" size={20} />
      </button>
      <button
        type="button"
        aria-label={music.isPlaying ? "Pause" : "Play"}
        onClick={music.toggle}
        className="flex h-12 w-12 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-accent text-white transition-transform active:scale-[0.97]"
      >
        <Icon name={music.isPlaying ? "pause" : "play"} size={20} />
      </button>
      <button
        type="button"
        aria-label="Next track"
        onClick={music.next}
        className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-text"
      >
        <Icon name="next" size={20} />
      </button>
    </div>
  );
}
