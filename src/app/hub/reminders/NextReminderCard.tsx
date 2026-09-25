"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import { formatTime12 } from "@/lib/reminders/recurrence";
import Icon from "../_components/Icon";
import { Eyebrow } from "../_components/BaseLayer";
import { useReminders } from "./useReminders";

/**
 * Home's reminder card. Home's rule is one fact per card, never a list, so this
 * is the single most useful fact: what is ringing now, or else what is next.
 * The list is one tap away on the Reminders screen.
 *
 * Replaces the fixture card that read HOME_CARDS.reminder from data.ts.
 */
export default function NextReminderCard() {
  const { state } = useReminders();
  const snap = state.snapshot;
  const tz = snap?.timezone ?? "UTC";
  const open = (snap?.agenda ?? []).filter((i) => i.status === "due" || i.status === "snoozed" || i.status === "upcoming");
  const ringing = open.find((i) => i.status === "due");
  const next = ringing ?? open[0];
  const at = next ? formatTime12(DateTime.fromISO(next.snoozedUntil ?? next.dueAt, { zone: tz }).toFormat("HH:mm")) : null;

  return (
    <Link
      href="/hub/reminders"
      className="flex h-[116px] flex-col justify-center gap-1.5 rounded-xl bg-surface px-5 py-4 no-underline shadow-card"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Icon name="reminders" size={14} strokeWidth={2.5} className="text-accent" />
          <Eyebrow tone={ringing ? "accent" : "muted"}>{ringing ? "Reminder · now" : "Next reminder"}</Eyebrow>
        </span>
        {at ? <span className="text-[13px] font-semibold leading-[18px] text-text tabular-nums">{at}</span> : null}
      </span>
      <span className="truncate font-heading text-xl font-bold leading-7 text-text">
        {next ? next.title : snap ? "Nothing else today" : " "}
      </span>
      <span className="truncate text-[13px] leading-[18px] text-ink-muted">
        {next
          ? [next.assignee?.name, open.length > 1 ? `${open.length - 1} more today` : null].filter(Boolean).join(" · ") ||
            " "
          : "Tap to add one"}
      </span>
    </Link>
  );
}
