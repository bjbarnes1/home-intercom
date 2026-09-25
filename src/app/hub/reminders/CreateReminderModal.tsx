"use client";

import { useCallback, useState } from "react";
import { DateTime } from "luxon";
import { useSpeechInput } from "@/lib/client/useSpeechInput";
import { describeRecurrence, DAY_LONG, formatTime12, type Weekday } from "@/lib/reminders/recurrence";
import { describeWhen } from "@/lib/reminders/ai/resolve";
import type { Member } from "@/lib/reminders/types";
import Avatar from "../_components/Avatar";
import Icon from "../_components/Icon";
import OverlayCard, { BackdropSketch } from "../_components/OverlayCard";
import { Stepper } from "./TriggeredAlert";
import { useReminders } from "./useReminders";
import {
  applyDraft,
  blankForm,
  flipMeridiem,
  formProblem,
  formToWhen,
  stepTime,
  type ReminderForm,
  type RepeatFreq,
} from "./form";

/**
 * Creation Modal — a new reminder, by voice or by touch.
 *
 * The top line is the fast path: say it (or type it) and "Fill in" hands the
 * sentence to the AI parser, which fills the form below. Nothing is saved
 * until Save: the parser proposes, the person confirms, and anything the
 * parser was unsure about is listed right there. Without a network or a
 * subscription the same box works on the offline parser.
 *
 * Every control below is a touch control, at least `--touch-min` in both
 * dimensions: avatar chips for who, day tiles rather than a calendar grid,
 * big ± steppers and quick-pick chips for the time, round toggles for
 * weekdays. There is no native <input type="date|time"> on purpose: on a
 * kiosk browser those open tiny OS pickers that were built for a mouse.
 */

const QUICK_TIMES: [string, string][] = [
  ["Morning", "07:30"],
  ["After school", "15:45"],
  ["Dinner", "18:00"],
  ["Bedtime", "19:45"],
];
const WEEKDAY_LETTERS: [Weekday, string][] = [
  [1, "M"],
  [2, "T"],
  [3, "W"],
  [4, "T"],
  [5, "F"],
  [6, "S"],
  [7, "S"],
];

export default function CreateReminderModal() {
  const { state, parse, create, closeCreate } = useReminders();
  const tz = state.snapshot?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const members = state.snapshot?.members ?? [];
  const now = DateTime.now().setZone(tz);

  const [form, setForm] = useState<ReminderForm>(() => blankForm(now));
  const [ask, setAsk] = useState("");
  const [parsing, setParsing] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = useCallback((patch: Partial<ReminderForm>) => setForm((f) => ({ ...f, ...patch })), []);

  const fillIn = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setParsing(true);
      setError(null);
      const out = await parse(text);
      setParsing(false);
      if ("error" in out) {
        setError(out.error);
        return;
      }
      setForm((f) => applyDraft(f, out.draft, tz));
      setIssues(out.issues);
    },
    [parse, tz],
  );

  const speech = useSpeechInput((text) => {
    setAsk(text);
    void fillIn(text);
  });

  const problem = formProblem(form, tz, now);
  const previewWhen = formToWhen(form, tz, now);
  const previewText =
    previewWhen.kind === "recurring" ? describeRecurrence(previewWhen.rule) : describeWhen(previewWhen, now);
  const previewWho = members.find((m) => m.id === form.assignee?.id && m.kind === form.assignee?.kind);
  const preview = previewWho ? `${previewWho.name} · ${previewText}` : previewText;

  const save = async () => {
    if (problem) return;
    setSaving(true);
    setError(null);
    const r = await create({
      title: form.title.trim(),
      details: form.details.trim() || null,
      assignee: form.assignee,
      when: formToWhen(form, tz, DateTime.now().setZone(tz)),
    });
    setSaving(false);
    if (r.ok) closeCreate();
    else setError(r.error);
  };

  return (
    <OverlayCard width={760} backdrop={<BackdropSketch rows={4} />}>
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="flex flex-none items-center justify-between gap-4 pb-4">
          <span className="font-heading text-[26px] font-extrabold text-text">New reminder</span>
          <button
            type="button"
            onClick={closeCreate}
            aria-label="Close"
            className="flex h-[var(--touch-min)] w-[var(--touch-min)] cursor-pointer items-center justify-center rounded-full border-none bg-bg text-neutral-300"
          >
            <Icon name="close" size={22} />
          </button>
        </div>

        <div className="no-scrollbar flex min-h-0 flex-col gap-5 overflow-y-auto pb-2">
          {/* The fast path. */}
          <div className="flex gap-[var(--touch-gap)]">
            {speech.supported ? (
              <button
                type="button"
                onClick={speech.listening ? speech.stop : speech.start}
                aria-label={speech.listening ? "Stop listening" : "Say it"}
                className={`flex h-[var(--touch-min)] w-[var(--touch-min)] flex-none cursor-pointer items-center justify-center rounded-full border-none ${
                  speech.listening ? "bg-accent text-white animate-breathe" : "bg-accent-900 text-accent"
                }`}
              >
                <Icon name="mic" size={24} />
              </button>
            ) : null}
            <input
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void fillIn(ask)}
              placeholder="“Remind Gus to take the bins out every Tuesday night”"
              className="h-[var(--touch-min)] min-w-0 flex-grow rounded-full border-2 border-divider bg-surface px-5 text-[16px] text-text outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void fillIn(ask)}
              disabled={parsing || !ask.trim()}
              className="flex h-[var(--touch-min)] flex-none cursor-pointer items-center gap-2 rounded-full border-none bg-accent px-5 text-[15px] font-bold text-white disabled:opacity-50"
            >
              <Icon name="sparkle" size={18} />
              {parsing ? "Reading…" : "Fill in"}
            </button>
          </div>

          {issues.length ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 rounded-xl bg-accent-900 p-3.5 pl-4">
              {issues.map((i) => (
                <li key={i} className="flex items-start gap-2 text-[14px] font-medium leading-5 text-accent-200">
                  <Icon name="alert" size={16} className="mt-0.5 flex-none" />
                  {i}
                </li>
              ))}
            </ul>
          ) : null}

          <Field label="What">
            <input
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Take the bins out"
              maxLength={200}
              className="h-[var(--touch-min)] w-full rounded-xl border-2 border-divider bg-surface px-4 font-heading text-[20px] font-bold text-text outline-none focus:border-accent"
            />
          </Field>

          <Field label="Who">
            <WhoPicker members={members} value={form.assignee} onChange={(assignee) => set({ assignee })} />
          </Field>

          <Field label="When">
            <Segmented
              options={[
                ["once", "Once"],
                ["repeat", "Repeats"],
              ]}
              value={form.mode}
              onChange={(mode) => set({ mode })}
            />
            <div className="mt-3">
              {form.mode === "once" ? (
                <DayStrip now={now} value={form.day} onChange={(day) => set({ day })} />
              ) : (
                <RepeatEditor form={form} set={set} />
              )}
            </div>
            <div className="mt-3">
              <TimePicker value={form.time} onChange={(time) => set({ time })} />
            </div>
          </Field>

          <Field label="Details (optional)">
            <textarea
              value={form.details}
              onChange={(e) => set({ details: e.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="Green bin and recycling this week"
              className="w-full resize-none rounded-xl border-2 border-divider bg-surface px-4 py-3 text-[16px] text-text outline-none focus:border-accent"
            />
          </Field>
        </div>

        <div className="flex flex-none flex-col gap-2 border-t border-divider pt-4">
          <span className="text-center text-[14px] font-semibold text-neutral-400">{problem ?? preview}</span>
          {error ? <span className="text-center text-sm font-semibold text-danger">{error}</span> : null}
          <div className="grid grid-cols-[1fr_2fr] gap-[var(--touch-gap)]">
            <button
              type="button"
              onClick={closeCreate}
              className="min-h-[var(--touch-min)] cursor-pointer rounded-full border-2 border-divider bg-surface text-[17px] font-bold text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!!problem || saving}
              className="min-h-[var(--touch-min)] cursor-pointer rounded-full border-none bg-accent text-[18px] font-extrabold text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save reminder"}
            </button>
          </div>
        </div>
      </div>
    </OverlayCard>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-400">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1.5 rounded-full bg-bg p-1.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-[calc(var(--touch-min)-12px)] flex-1 cursor-pointer rounded-full border-none text-[16px] font-bold transition-colors ${
            value === v ? "bg-surface text-accent shadow-card" : "bg-transparent text-neutral-400"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function WhoPicker({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: { kind: string; id: string } | null;
  onChange: (v: { kind: "user" | "kid"; id: string } | null) => void;
}) {
  const chip = (selected: boolean) =>
    `flex min-h-[var(--touch-min)] flex-none cursor-pointer items-center gap-2.5 rounded-full border-2 py-1.5 pl-1.5 pr-4 text-[15px] font-semibold transition-colors ${
      selected ? "border-accent bg-accent-900 text-accent-200" : "border-divider bg-surface text-text"
    }`;
  return (
    <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
      <button type="button" onClick={() => onChange(null)} className={chip(value === null)}>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bg text-neutral-400">
          <Icon name="home" size={20} />
        </span>
        Everyone
      </button>
      {members.map((m) => (
        <button
          key={`${m.kind}:${m.id}`}
          type="button"
          onClick={() => onChange({ kind: m.kind, id: m.id })}
          className={chip(value?.id === m.id && value?.kind === m.kind)}
        >
          <Avatar who={m.name} size={44} />
          {m.name}
        </button>
      ))}
    </div>
  );
}

function DayStrip({ now, value, onChange }: { now: DateTime; value: string; onChange: (d: string) => void }) {
  const days = Array.from({ length: 14 }, (_, i) => now.startOf("day").plus({ days: i }));
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
      {days.map((d, i) => {
        const iso = d.toISODate()!;
        const on = iso === value;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            className={`flex min-h-[calc(var(--touch-min)*1.3)] min-w-[calc(var(--touch-min)*1.3)] flex-none cursor-pointer flex-col items-center justify-center rounded-2xl border-2 px-2 ${
              on ? "border-accent bg-accent text-white" : "border-divider bg-surface text-text"
            }`}
          >
            <span className={`text-[12px] font-bold uppercase tracking-[0.06em] ${on ? "text-white" : "text-neutral-400"}`}>
              {i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toFormat("ccc")}
            </span>
            <span className="font-heading text-[22px] font-extrabold leading-7">{d.day}</span>
          </button>
        );
      })}
    </div>
  );
}

function RepeatEditor({ form, set }: { form: ReminderForm; set: (p: Partial<ReminderForm>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Segmented<RepeatFreq>
        options={[
          ["daily", "Daily"],
          ["weekly", "Weekly"],
          ["fortnightly", "Fortnightly"],
          ["monthly", "Monthly"],
        ]}
        value={form.freq}
        onChange={(freq) => set({ freq })}
      />
      {form.freq === "weekly" || form.freq === "fortnightly" ? (
        <div className="flex justify-between gap-2">
          {WEEKDAY_LETTERS.map(([d, letter]) => {
            const on = form.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-label={DAY_LONG[d]}
                aria-pressed={on}
                onClick={() =>
                  set({ weekdays: on ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d] })
                }
                className={`flex h-[var(--touch-min)] w-[var(--touch-min)] cursor-pointer items-center justify-center rounded-full border-2 font-heading text-[18px] font-extrabold ${
                  on ? "border-accent bg-accent text-white" : "border-divider bg-surface text-text"
                }`}
              >
                {letter}
              </button>
            );
          })}
        </div>
      ) : null}
      {form.freq === "monthly" ? (
        <div className="flex flex-col gap-3">
          <Segmented
            options={[
              ["day", "On a date"],
              ["nth", "On a weekday"],
            ]}
            value={form.monthMode}
            onChange={(monthMode) => set({ monthMode })}
          />
          {form.monthMode === "day" ? (
            <div className="flex items-center justify-center gap-5">
              <Stepper icon="minus" label="Earlier" onClick={() => set({ monthDay: Math.max(1, form.monthDay - 1) })} />
              <span className="min-w-[140px] text-center font-heading text-[24px] font-extrabold text-text">
                Day {form.monthDay}
              </span>
              <Stepper icon="plus" label="Later" onClick={() => set({ monthDay: Math.min(31, form.monthDay + 1) })} />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Segmented
                options={[
                  ["1", "1st"],
                  ["2", "2nd"],
                  ["3", "3rd"],
                  ["4", "4th"],
                  ["-1", "Last"],
                ]}
                value={String(form.nth)}
                onChange={(n) => set({ nth: Number(n) as ReminderForm["nth"] })}
              />
              <div className="flex justify-between gap-2">
                {WEEKDAY_LETTERS.map(([d, letter]) => (
                  <button
                    key={d}
                    type="button"
                    aria-label={DAY_LONG[d]}
                    aria-pressed={form.nthWeekday === d}
                    onClick={() => set({ nthWeekday: d })}
                    className={`flex h-[var(--touch-min)] w-[var(--touch-min)] cursor-pointer items-center justify-center rounded-full border-2 font-heading text-[18px] font-extrabold ${
                      form.nthWeekday === d ? "border-accent bg-accent text-white" : "border-divider bg-surface text-text"
                    }`}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TimePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const pm = Number(value.slice(0, 2)) >= 12;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-bg p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col items-center gap-1">
          <Stepper icon="minus" label="Hour earlier" onClick={() => onChange(stepTime(value, -60))} />
          <span className="text-[11px] font-bold uppercase text-neutral-400">Hour</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Stepper icon="minus" label="5 minutes earlier" onClick={() => onChange(stepTime(value, -5))} />
          <span className="text-[11px] font-bold uppercase text-neutral-400">5 min</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(flipMeridiem(value))}
          aria-label={`${formatTime12(value)}. Tap to switch to ${pm ? "am" : "pm"}.`}
          className="flex min-h-[var(--touch-min)] min-w-[180px] cursor-pointer flex-col items-center rounded-2xl border-none bg-surface px-4 py-2 shadow-card"
        >
          <span className="font-heading text-[40px] font-extrabold leading-none text-text tabular-nums">
            {formatTime12(value).replace(/ (am|pm)$/, "")}
          </span>
          <span className="mt-1 text-[13px] font-bold uppercase tracking-[0.08em] text-accent">{pm ? "pm" : "am"} ⇄</span>
        </button>
        <div className="flex flex-col items-center gap-1">
          <Stepper icon="plus" label="5 minutes later" onClick={() => onChange(stepTime(value, 5))} />
          <span className="text-[11px] font-bold uppercase text-neutral-400">5 min</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <Stepper icon="plus" label="Hour later" onClick={() => onChange(stepTime(value, 60))} />
          <span className="text-[11px] font-bold uppercase text-neutral-400">Hour</span>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {QUICK_TIMES.map(([label, t]) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`flex min-h-[var(--touch-min)] cursor-pointer flex-col items-center justify-center rounded-xl border-2 text-[13px] font-bold ${
              value === t ? "border-accent bg-accent-900 text-accent-200" : "border-divider bg-surface text-text"
            }`}
          >
            {label}
            <span className="text-[12px] font-semibold text-neutral-400">{formatTime12(t)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
