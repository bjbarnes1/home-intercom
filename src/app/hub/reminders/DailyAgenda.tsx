"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { formatTime12 } from "@/lib/reminders/recurrence";
import type { AgendaItem, AgendaStatus } from "@/lib/reminders/types";
import Avatar from "../_components/Avatar";
import Icon from "../_components/Icon";
import { Eyebrow } from "../_components/BaseLayer";
import { useReminders } from "./useReminders";

/**
 * Daily Agenda — today's reminders for the whole house.
 *
 * Public by construction: it lists what the household set for everyone to see
 * (bins, swimming bags, the dentist), the same as a fridge whiteboard.
 *
 * Two sizes:
 *  - `compact` for Home: the next few, one line each, the header opens the
 *    Reminders screen. Home's rule is one fact per card, so this card's fact is
 *    "what's coming", and done items drop off it.
 *  - `full` for the Reminders screen: the whole day, done and missed included,
 *    each row with a large check target when it can be completed.
 *
 * A row can be ticked once its slot has fired (there is an occurrence to
 * complete). Before that it shows its time; ticking tonight's bins at 8 am is
 * not a thing this model pretends to support.
 */

const LABEL: Record<AgendaStatus, string> = {
  upcoming: "",
  due: "Now",
  snoozed: "Snoozed",
  done: "Done",
  dismissed: "Dismissed",
  missed: "Missed",
};

export default function DailyAgenda({
  variant,
  onOpenAll,
}: {
  variant: "compact" | "full";
  onOpenAll?: () => void;
}) {
  const { state, complete, openCreate } = useReminders();
  const [error, setError] = useState<string | null>(null);
  const snap = state.snapshot;
  const tz = snap?.timezone ?? "UTC";

  const all = snap?.agenda ?? [];
  const items =
    variant === "compact"
      ? all.filter((i) => i.status === "upcoming" || i.status === "due" || i.status === "snoozed").slice(0, 3)
      : all;
  const left = all.filter((i) => i.status !== "done" && i.status !== "dismissed" && i.status !== "missed").length;

  const onTick = async (item: AgendaItem) => {
    if (!item.occurrenceId) return;
    setError(null);
    const r = await complete(item.occurrenceId);
    if (!r.ok) setError(r.error);
  };

  return (
    <section
      aria-label="Today's reminders"
      className={`flex min-w-0 flex-col rounded-[20px] bg-surface shadow-card ${variant === "full" ? "p-6" : "p-5"}`}
    >
      <div className="flex flex-none items-center justify-between gap-2 pb-3">
        <button
          type="button"
          onClick={onOpenAll}
          disabled={!onOpenAll}
          className="flex cursor-pointer items-center gap-2.5 border-none bg-transparent p-0 disabled:cursor-default"
        >
          <Icon name="reminders" size={16} className="text-accent" />
          <Eyebrow>Today&apos;s reminders</Eyebrow>
        </button>
        <span className="flex items-center gap-3">
          <Eyebrow tone="muted">{snap ? (left ? `${left} to go` : "All clear") : "…"}</Eyebrow>
          <button
            type="button"
            onClick={openCreate}
            aria-label="New reminder"
            className="flex h-[var(--touch-min)] min-w-[var(--touch-min)] cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-accent-900 px-4 text-sm font-bold text-accent"
          >
            <Icon name="plus" size={18} strokeWidth={2.5} />
            {variant === "full" ? "New" : null}
          </button>
        </span>
      </div>

      {!snap ? (
        <Placeholder text="Loading today…" />
      ) : items.length === 0 ? (
        <Placeholder text={all.length ? "Nothing else today." : "Nothing set for today."} />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((item, i) => (
            <Row key={item.key} item={item} tz={tz} first={i === 0} full={variant === "full"} onTick={onTick} />
          ))}
        </ul>
      )}

      {error ? <span className="mt-2 text-sm font-semibold text-danger">{error}</span> : null}
    </section>
  );
}

function Row({
  item,
  tz,
  first,
  full,
  onTick,
}: {
  item: AgendaItem;
  tz: string;
  first: boolean;
  full: boolean;
  onTick: (item: AgendaItem) => void;
}) {
  const at = DateTime.fromISO(item.snoozedUntil ?? item.dueAt, { zone: tz });
  const finished = item.status === "done" || item.status === "dismissed" || item.status === "missed";
  const tickable = !!item.occurrenceId && (item.status === "due" || item.status === "snoozed");
  const label = LABEL[item.status];

  return (
    <li className={`flex min-w-0 items-center gap-4 py-2.5 ${first ? "" : "border-t border-divider"}`}>
      <span
        className={`w-[76px] flex-none text-[15px] font-semibold leading-5 tabular-nums ${
          finished ? "text-ink-muted" : "text-text"
        }`}
      >
        {formatTime12(at.toFormat("HH:mm"))}
      </span>

      <span className="flex min-w-0 flex-grow flex-col gap-0.5">
        <span
          className={`truncate text-[16px] font-semibold leading-6 ${finished ? "text-ink-muted line-through" : "text-text"}`}
        >
          {item.title}
        </span>
        {full && (item.repeat || item.details) ? (
          <span className="truncate text-[13px] leading-[18px] text-ink-muted">
            {[item.repeat, item.details].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>

      {label ? (
        <span
          className={`flex-none rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${
            item.status === "due" ? "bg-accent text-white" : "bg-bg text-neutral-400"
          }`}
        >
          {label}
        </span>
      ) : null}

      {item.assignee ? <Avatar who={item.assignee.name} size={36} ring="var(--color-surface)" /> : null}

      {full || tickable ? (
        <button
          type="button"
          disabled={!tickable}
          onClick={() => onTick(item)}
          aria-label={tickable ? `Mark “${item.title}” done` : undefined}
          aria-hidden={!tickable}
          className={`flex h-[var(--touch-min)] w-[var(--touch-min)] flex-none items-center justify-center rounded-full border-2 transition-transform active:scale-[0.94] ${
            item.status === "done"
              ? "border-accent bg-accent text-white"
              : tickable
                ? "cursor-pointer border-accent bg-surface text-accent"
                : "border-transparent bg-transparent text-transparent"
          }`}
        >
          <Icon name="check" size={24} strokeWidth={3} />
        </button>
      ) : null}
    </li>
  );
}

function Placeholder({ text }: { text: string }) {
  return <span className="py-6 text-center text-[15px] text-ink-muted">{text}</span>;
}
