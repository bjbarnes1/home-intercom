"use client";

import type { MusicActionRequest } from "@/lib/music/actions";
import type { MusicState } from "./types";

interface Props {
  music: MusicState | null;
  room: string;
  onAction: (body: MusicActionRequest) => void;
  onClose: () => void;
}

export default function MusicPlayer({ music, room, onAction, onClose }: Props) {
  if (!music) {
    return (
      <div className="flex flex-1 items-center justify-center text-neutral-500">
        Loading…
      </div>
    );
  }
  const otherSource = music.source === "Household" ? "Spotify" : "Household";
  return (
    <div className="flex flex-1 items-center gap-7 px-7 pb-8">
      <div
        className="grid h-60 w-60 flex-none place-items-center rounded-xl"
        style={{
          background: "linear-gradient(150deg, var(--color-accent-800), var(--color-neutral-900))",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <i className="ph ph-vinyl-record text-7xl text-accent-300 opacity-75" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-2.5 flex items-center gap-2">
          <span className="tag tag-neutral">{music.source}</span>
          <button onClick={onClose} className="ml-auto btn btn-ghost min-h-8 text-xs">
            <i className="ph ph-x" />
            Close
          </button>
        </div>
        <div className="font-heading text-4xl font-medium leading-tight">
          {music.track.title}
        </div>
        <div className="mt-1 text-lg text-neutral-400">{music.track.artist}</div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => onAction({ action: "prev" })}
            className="grid h-14 w-14 place-items-center rounded-full bg-surface hover:bg-neutral-800"
          >
            <i className="ph-fill ph-skip-back text-lg" />
          </button>
          <button
            onClick={() => onAction({ action: music.isPlaying ? "pause" : "play" })}
            className="grid h-16 w-16 place-items-center rounded-full border border-accent text-accent hover:bg-accent-900"
          >
            <i className={`ph-fill ${music.isPlaying ? "ph-pause" : "ph-play"} text-2xl`} />
          </button>
          <button
            onClick={() => onAction({ action: "next" })}
            className="grid h-14 w-14 place-items-center rounded-full bg-surface hover:bg-neutral-800"
          >
            <i className="ph-fill ph-skip-forward text-lg" />
          </button>
          <div className="mx-2 h-10 w-px bg-divider" />
          <button
            onClick={() =>
              onAction({
                action: "source",
                source: otherSource as "Household" | "Spotify",
              })
            }
            className="btn btn-secondary"
          >
            <i className="ph ph-shuffle-angular" />
            Switch to {otherSource}
          </button>
        </div>

        <div className="mt-6">
          <div className="uplabel mb-2">Playing in</div>
          <div className="flex flex-wrap gap-2">
            {music.availableRooms.map((r) => {
              const on = music.rooms.includes(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() => onAction({ action: "toggleRoom", deviceId: r.id })}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition ${
                    on
                      ? "bg-accent text-[#141221]"
                      : "border border-divider text-neutral-300 hover:border-accent"
                  }`}
                >
                  <i className="ph ph-speaker-high text-base" />
                  {r.displayName}
                  {r.displayName === room && " (here)"}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
