"use client";

import Avatar from "./Avatar";
import Icon from "./Icon";
import OverlayCard, { BackdropSketch } from "./OverlayCard";

/**
 * Somebody is calling this room.
 *
 * Answer is the larger, accent target because it is what the caller wants and
 * what the person walking up almost always means. Declining is deliberate but
 * never hidden — a panel that cannot be refused is a panel people unplug.
 */
export default function RingCard({
  who,
  room,
  onAnswer,
  onDecline,
}: {
  who: string;
  room: string;
  onAnswer: () => void;
  onDecline: () => void;
}) {
  return (
    <OverlayCard width={560} backdrop={<BackdropSketch rows={4} />}>
      <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-accent">
        Calling {room}
      </span>

      <span className="mt-4">
        <Avatar who={who} size={104} />
      </span>
      <span className="mt-3.5 font-heading text-[32px] font-bold leading-10 tracking-tight text-text">{who}</span>
      <span className="text-[15px] leading-5 text-ink-muted">Two-way — they&rsquo;ll hear the room</span>

      <span className="mt-7 flex w-full gap-3">
        <button
          type="button"
          onClick={onDecline}
          className="flex h-13 flex-grow cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-surface text-sm font-bold text-text transition-transform active:scale-[0.97]"
          style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
        >
          Not now
        </button>
        <button
          type="button"
          onClick={onAnswer}
          className="flex h-13 flex-grow cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-accent text-sm font-bold text-white transition-transform active:scale-[0.97]"
        >
          <Icon name="intercom" size={18} />
          Answer
        </button>
      </span>
    </OverlayCard>
  );
}
