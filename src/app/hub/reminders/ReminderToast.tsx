"use client";

import type { ActiveAlert } from "@/lib/reminders/types";
import Avatar from "../_components/Avatar";
import Icon from "../_components/Icon";

/**
 * A tucked-away alert: the Triggered Alert after "Later". It stays in sight at
 * the top of every screen until someone answers it, and one tap brings the full
 * card back. Not a new interruption shape. It is how the card looks while it
 * waits.
 */
export default function ReminderToast({
  alerts,
  onOpen,
}: {
  alerts: ActiveAlert[];
  onOpen: (occurrenceId: string) => void;
}) {
  if (alerts.length === 0) return null;
  const first = alerts[0];
  return (
    <button
      type="button"
      onClick={() => onOpen(first.occurrenceId)}
      className="fixed left-1/2 top-3 z-40 flex min-h-[var(--touch-min)] max-w-[min(640px,calc(100%-48px))] -translate-x-1/2 cursor-pointer items-center gap-3 rounded-full border-none bg-surface py-2 pl-2 pr-5 text-left"
      style={{ boxShadow: "var(--shadow-overlay)" }}
      aria-label={`Reminder: ${first.title}. Tap to answer.`}
    >
      {first.assignee ? (
        <Avatar who={first.assignee} size={44} />
      ) : (
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-accent text-white">
          <Icon name="reminders" size={22} />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-bold leading-5 text-text">{first.title}</span>
        <span className="text-[12px] font-semibold leading-4 text-accent">
          Tap to answer{alerts.length > 1 ? ` · ${alerts.length - 1} more` : ""}
        </span>
      </span>
    </button>
  );
}
