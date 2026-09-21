"use client";

import { useCallback, useRef, useState } from "react";
import { Eyebrow } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import { Heart } from "./SearchOverlay";
import type { AppleMusic, Track } from "./useAppleMusic";

/**
 * Up next, and what has just been played.
 *
 * A track can be dragged out of Recently played and into the queue. Where it
 * lands decides which of the two operations MusicKit actually supports: the top
 * of the list means next, anywhere else means the end. Nothing pretends to
 * insert at an arbitrary point, because nothing can.
 *
 * Pointer events rather than HTML5 drag-and-drop, which does not fire on touch
 * at all — this runs on a wall panel that has no mouse.
 */

/** Far enough to be a drag rather than a tap that wobbled. */
const DRAG_THRESHOLD_PX = 8;

interface Dragging {
  track: Track;
  x: number;
  y: number;
}

export default function QueueLists({ music }: { music: AppleMusic }) {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [over, setOver] = useState<"next" | "later" | null>(null);
  const queueRef = useRef<HTMLDivElement | null>(null);

  /** Which half of the queue the pointer is over, if any. */
  const zoneAt = useCallback((x: number, y: number): "next" | "later" | null => {
    const box = queueRef.current?.getBoundingClientRect();
    if (!box) return null;
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) return null;
    return y < box.top + Math.min(96, box.height / 3) ? "next" : "later";
  }, []);

  const start = useCallback(
    (track: Track) => (e: React.PointerEvent) => {
      const from = { x: e.clientX, y: e.clientY };
      const id = e.pointerId;
      let live = false;

      const move = (ev: PointerEvent) => {
        if (!live && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < DRAG_THRESHOLD_PX) return;
        live = true;
        setDragging({ track, x: ev.clientX, y: ev.clientY });
        setOver(zoneAt(ev.clientX, ev.clientY));
      };

      const end = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        setDragging(null);
        setOver(null);
        if (!live) return;

        const zone = zoneAt(ev.clientX, ev.clientY);
        if (zone === "next") music.queueNext(track.id);
        else if (zone === "later") music.queueLater(track.id);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      void id;
    },
    [music, zoneAt],
  );

  return (
    <div className="flex min-h-0 flex-grow gap-4 pt-2">
      <div className="flex min-w-0 flex-grow basis-0 flex-col gap-2">
        <span className="flex items-center justify-between gap-2 px-1">
          <Eyebrow tone="ink">Up next</Eyebrow>
          {dragging ? <Eyebrow tone="muted">{over === "next" ? "Play next" : "Add to the end"}</Eyebrow> : null}
        </span>

        <div
          ref={queueRef}
          className="flex min-h-0 flex-grow flex-col gap-0.5 overflow-y-auto rounded-xl bg-surface p-2 shadow-card transition-shadow"
          style={
            dragging
              ? { boxShadow: "inset 0 0 0 2px var(--color-accent)", background: "rgba(59,92,246,0.04)" }
              : undefined
          }
        >
          {/* Where a drop at the top would land. */}
          {dragging && over === "next" ? (
            <span className="mx-1 h-1 flex-none rounded-full bg-accent" />
          ) : null}

          {music.queue.map((t) => (
            <div
              key={t.id}
              aria-current={t.playing ? "true" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 ${t.playing ? "bg-bg" : ""}`}
            >
              <button
                type="button"
                onClick={() => music.playQueueIndex(t.index)}
                className="flex min-w-0 flex-grow cursor-pointer items-center gap-3.5 border-none bg-transparent p-0 text-left"
              >
                <span
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                  style={{ background: "rgba(59,92,246,0.10)" }}
                >
                  <Icon
                    name={t.playing && music.isPlaying ? "pause" : "music"}
                    size={17}
                    className="text-accent"
                  />
                </span>
                <span className="flex min-w-0 flex-grow flex-col">
                  <span
                    className={`truncate text-[13px] leading-[18px] ${
                      t.playing ? "font-bold text-accent" : "font-semibold text-text"
                    }`}
                  >
                    {t.title}
                  </span>
                  <span className="truncate text-xs leading-4 text-ink-muted">{t.artist}</span>
                </span>
              </button>
              <Heart music={music} kind="songs" id={stripIndex(t.id)} />
              <span className="flex-none text-xs font-medium leading-4 text-ink-muted tabular-nums">
                {t.length}
              </span>
            </div>
          ))}

          {!music.queue.length ? (
            <span className="px-3 py-3 text-[13px] leading-[18px] text-ink-muted">
              Nothing queued. Start a playlist, search for a song, or drag one across from
              Recently&nbsp;played.
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-grow basis-0 flex-col gap-2">
        <span className="px-1">
          <Eyebrow tone="ink">Recently played</Eyebrow>
        </span>
        <div className="flex min-h-0 flex-grow flex-col gap-0.5 overflow-y-auto rounded-xl bg-surface p-2 shadow-card">
          {music.recent.map((t) => (
            <div
              key={t.id}
              onPointerDown={start(t)}
              // The browser's own scroll gesture would swallow the drag.
              style={{ touchAction: "none" }}
              className={`flex cursor-grab items-center gap-3 rounded-xl px-3 py-2 transition-opacity ${
                dragging?.track.id === t.id ? "opacity-40" : ""
              }`}
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
              <Heart music={music} kind="songs" id={t.id} />
              <span className="flex-none text-xs font-medium leading-4 text-ink-muted tabular-nums">
                {t.length}
              </span>
            </div>
          ))}
          {!music.recent.length ? (
            <span className="px-3 py-3 text-[13px] leading-[18px] text-ink-muted">
              Nothing played on this Hub yet.
            </span>
          ) : null}
        </div>
      </div>

      {/* The thing under the finger. Pointer-transparent so the drop zone sees through it. */}
      {dragging ? (
        <span
          aria-hidden
          className="pointer-events-none fixed z-[60] flex items-center gap-3 rounded-xl bg-surface px-3 py-2 shadow-overlay"
          style={{ left: dragging.x + 12, top: dragging.y - 20 }}
        >
          <Icon name="music" size={17} className="text-accent" />
          <span className="max-w-[220px] truncate text-[13px] font-semibold leading-[18px] text-text">
            {dragging.track.title}
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** Queue rows carry a positional suffix so React can key duplicates apart. */
function stripIndex(id: string): string {
  return id.replace(/-\d+$/, "");
}
