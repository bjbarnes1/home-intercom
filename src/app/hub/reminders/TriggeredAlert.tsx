"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { ident } from "@/lib/color/identity";
import { speak } from "@/lib/client/speak";
import { SNOOZE_LABEL, SNOOZE_PRESETS, type SnoozeRequest } from "@/lib/reminders/snooze";
import { formatTime12 } from "@/lib/reminders/recurrence";
import type { ActiveAlert } from "@/lib/reminders/types";
import Avatar from "../_components/Avatar";
import Icon from "../_components/Icon";
import OverlayCard, { BackdropSketch } from "../_components/OverlayCard";
import type { ActionResult } from "./useReminders";

/**
 * Triggered Alert — a reminder ringing, waiting for an answer.
 *
 * The one Overlay Card, like every other interruption. Two things are
 * different about it compared with a broadcast:
 *
 *  - It does not disappear on its own. A broadcast is information; a reminder
 *    is a task, and the task is not done because a countdown ran out. Its
 *    stated exit is a visible one — "Later" — which tucks it into a pill at
 *    the top of the screen rather than losing it. After two minutes untouched
 *    it tucks itself away the same way, so an unattended kitchen panel is
 *    never held hostage by one card.
 *  - Its two actions are the biggest targets in the system (`--touch-hero`,
 *    well over the ~10mm floor). This is tapped on the way past, with a plate
 *    in the other hand. Complete is the primary, filled; Snooze is secondary.
 *
 * Snooze opens in place (no second card): four presets, then Custom with
 * large ± steppers. Nothing here needs a keyboard.
 */

const AUTO_TUCK_MS = 2 * 60 * 1000;

export default function TriggeredAlert({
  alert,
  queued,
  timezone,
  onComplete,
  onSnooze,
  onDismiss,
  onLater,
}: {
  alert: ActiveAlert;
  /** How many more are waiting behind this one. */
  queued: number;
  timezone: string;
  onComplete: () => Promise<ActionResult>;
  onSnooze: (req: SnoozeRequest) => Promise<ActionResult>;
  onDismiss: () => Promise<ActionResult>;
  onLater: () => void;
}) {
  const [mode, setMode] = useState<"main" | "snooze" | "custom">("main");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customMin, setCustomMin] = useState(30);

  // A new alert (the queue advanced) starts from the top.
  useEffect(() => {
    setMode("main");
    setError(null);
    setBusy(false);
  }, [alert.occurrenceId]);

  // Tuck away after a while untouched; any tap restarts the clock.
  const [touchedAt, setTouchedAt] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setTimeout(onLater, Math.max(0, AUTO_TUCK_MS - (Date.now() - touchedAt)));
    return () => window.clearTimeout(id);
  }, [touchedAt, onLater, alert.occurrenceId]);

  const run = async (fn: () => Promise<ActionResult>) => {
    setTouchedAt(Date.now());
    setBusy(true);
    setError(null);
    const r = await fn();
    // On success the card unmounts (the store drops the alert); only a
    // failure is left for us to show.
    if (!r.ok) {
      setBusy(false);
      setError(r.error);
    }
  };

  const due = DateTime.fromISO(alert.dueAt, { zone: timezone });
  const dueLabel = formatTime12(due.toFormat("HH:mm"));
  const who = alert.assignee ?? undefined;

  return (
    <OverlayCard width={640} backdrop={<BackdropSketch rows={4} />}>
      <div className="flex w-full flex-col items-center" onPointerDown={() => setTouchedAt(Date.now())}>
        <span className="flex items-center gap-2 text-[12px] font-bold uppercase leading-4 tracking-[0.08em] text-accent">
          <Icon name="reminders" size={14} strokeWidth={2.5} />
          Reminder · {alert.late ? `was due ${dueLabel}` : dueLabel}
          {queued > 0 ? <span className="text-neutral-400">· {queued} more</span> : null}
        </span>

        {who ? (
          <span className="mt-5 flex flex-col items-center gap-2">
            <Avatar who={who} size={84} />
            <span className="text-sm font-semibold leading-5" style={{ color: ident(who) }}>
              For {who}
            </span>
          </span>
        ) : null}

        <h2
          className="mt-4 text-center font-heading text-[clamp(32px,4.2vw,52px)] font-extrabold leading-[1.08] tracking-[-0.02em] text-text"
          style={{ fontWeight: 800 }}
        >
          {alert.title}
        </h2>
        {alert.details ? (
          <p className="mt-3 max-w-[520px] text-center text-base leading-6 text-neutral-400">{alert.details}</p>
        ) : null}

        {mode === "main" ? (
          <div className="mt-7 grid w-full grid-cols-[1.35fr_1fr] gap-[var(--touch-gap)]">
            <HeroButton primary disabled={busy} onClick={() => run(onComplete)} icon="check" label="Done" />
            <HeroButton disabled={busy} onClick={() => setMode("snooze")} icon="clock" label="Snooze" />
          </div>
        ) : mode === "snooze" ? (
          <SnoozePicker
            busy={busy}
            onPick={(req) => run(() => onSnooze(req))}
            onCustom={() => setMode("custom")}
            onBack={() => setMode("main")}
            tomorrowLabel={`Tomorrow ${dueLabel}`}
          />
        ) : (
          <CustomSnooze
            minutes={customMin}
            setMinutes={setCustomMin}
            timezone={timezone}
            busy={busy}
            onConfirm={() => run(() => onSnooze({ minutes: customMin }))}
            onBack={() => setMode("snooze")}
          />
        )}

        {error ? (
          <span role="alert" className="mt-4 text-sm font-semibold text-danger">
            {error}
          </span>
        ) : null}

        <div className="mt-5 flex w-full items-center justify-between gap-3">
          <SmallButton onClick={() => void speak(alert.spoken ?? alert.title, alert.audioUrl)} icon="speaker" label="Say again" />
          <SmallButton onClick={() => run(onDismiss)} icon="close" label="Dismiss" disabled={busy} />
          <SmallButton onClick={onLater} icon="chevronDown" label="Later" />
        </div>
      </div>
    </OverlayCard>
  );
}

function HeroButton({
  primary,
  icon,
  label,
  onClick,
  disabled,
}: {
  primary?: boolean;
  icon: "check" | "clock";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[var(--touch-hero)] cursor-pointer items-center justify-center gap-3 rounded-[28px] border-2 font-heading text-[26px] font-extrabold transition-transform active:scale-[0.97] disabled:opacity-60 ${
        primary ? "border-accent bg-accent text-white" : "border-divider bg-surface text-text"
      }`}
      style={primary ? { boxShadow: "0 12px 28px rgba(59,92,246,0.32)" } : undefined}
    >
      <Icon name={icon} size={34} strokeWidth={2.75} />
      {label}
    </button>
  );
}

function SmallButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: "speaker" | "close" | "chevronDown";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[var(--touch-min)] flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-bg text-[15px] font-semibold text-neutral-300 active:scale-[0.97] disabled:opacity-60"
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );
}

function SnoozePicker({
  busy,
  onPick,
  onCustom,
  onBack,
  tomorrowLabel,
}: {
  busy: boolean;
  onPick: (req: SnoozeRequest) => void;
  onCustom: () => void;
  onBack: () => void;
  tomorrowLabel: string;
}) {
  return (
    <div className="mt-7 flex w-full flex-col gap-[var(--touch-gap)]">
      <span className="text-center text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-400">Snooze for</span>
      <div className="grid grid-cols-2 gap-[var(--touch-gap)]">
        {SNOOZE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => onPick({ preset: p })}
            className="min-h-[calc(var(--touch-min)*1.35)] cursor-pointer rounded-[22px] border-2 border-divider bg-surface font-heading text-[22px] font-bold text-text active:scale-[0.97] disabled:opacity-60"
          >
            {p === "tomorrow" ? tomorrowLabel : SNOOZE_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_1.5fr] gap-[var(--touch-gap)]">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[var(--touch-min)] cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-bg text-[15px] font-semibold text-neutral-300"
        >
          <Icon name="chevronLeft" size={18} />
          Back
        </button>
        <button
          type="button"
          onClick={onCustom}
          className="min-h-[var(--touch-min)] cursor-pointer rounded-full border-2 border-accent bg-transparent text-[16px] font-bold text-accent"
        >
          Pick a time…
        </button>
      </div>
    </div>
  );
}

const STEPS = [5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720];

function CustomSnooze({
  minutes,
  setMinutes,
  timezone,
  busy,
  onConfirm,
  onBack,
}: {
  minutes: number;
  setMinutes: (m: number) => void;
  timezone: string;
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const idx = Math.max(0, STEPS.indexOf(minutes));
  const until = DateTime.now().setZone(timezone).plus({ minutes });
  const label = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  return (
    <div className="mt-7 flex w-full flex-col gap-[var(--touch-gap)]">
      <div className="flex items-center justify-between gap-[var(--touch-gap)]">
        <Stepper icon="minus" disabled={idx === 0} onClick={() => setMinutes(STEPS[idx - 1])} label="Shorter" />
        <span className="flex flex-col items-center">
          <span className="font-heading text-[40px] font-extrabold leading-none text-text tabular-nums">{label}</span>
          <span className="mt-1.5 text-sm text-neutral-400">until {formatTime12(until.toFormat("HH:mm"))}</span>
        </span>
        <Stepper icon="plus" disabled={idx === STEPS.length - 1} onClick={() => setMinutes(STEPS[idx + 1])} label="Longer" />
      </div>
      <div className="grid grid-cols-[1fr_1.5fr] gap-[var(--touch-gap)]">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-[var(--touch-min)] cursor-pointer items-center justify-center gap-2 rounded-full border-none bg-bg text-[15px] font-semibold text-neutral-300"
        >
          <Icon name="chevronLeft" size={18} />
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="min-h-[var(--touch-min)] cursor-pointer rounded-full border-none bg-accent text-[17px] font-bold text-white disabled:opacity-60"
        >
          Snooze {label}
        </button>
      </div>
    </div>
  );
}

export function Stepper({
  icon,
  onClick,
  disabled,
  label,
}: {
  icon: "plus" | "minus";
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-[calc(var(--touch-min)*1.25)] w-[calc(var(--touch-min)*1.25)] flex-none cursor-pointer items-center justify-center rounded-full border-2 border-divider bg-surface text-text active:scale-[0.95] disabled:opacity-40"
    >
      <Icon name={icon} size={28} strokeWidth={2.5} />
    </button>
  );
}
