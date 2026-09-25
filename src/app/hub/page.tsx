"use client";

import { AT_HOME, HOME_CARDS, HOUSE_NOTE, OUT, PEOPLE, TODAY } from "./data";
import Avatar from "./_components/Avatar";
import BaseLayer, { Eyebrow } from "./_components/BaseLayer";
import Icon from "./_components/Icon";
import { useNow } from "./_components/Clock";
import NextReminderCard from "./reminders/NextReminderCard";

/**
 * Home — the ambient screen.
 *
 * Public with no exceptions: it runs with nobody identified in front of it, so
 * everything here would go on the fridge door. A personal calendar entry keeps
 * its slot and loses its content rather than vanishing, which would make the
 * shared day lie about when someone is free.
 *
 * The clock owns the screen. Three cards, one fact each, and nothing on it is a
 * list — lists live one tap away in the section that owns them.
 */
export default function HubHome() {
  const now = useNow();

  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)}>
      <div className="flex min-h-0 flex-grow items-stretch gap-8">
        <div className="flex min-w-0 flex-grow flex-col justify-center gap-1.5">
          {/* Until the first tick the slots are held open, so nothing below
              jumps when the real time arrives a frame later. */}
          <span className="text-base font-medium text-neutral-400">{now?.greeting ?? "\u00A0"}</span>
          <span className="font-heading text-[clamp(72px,11vw,132px)] font-extrabold leading-[0.92] tracking-[-0.045em] text-text tabular-nums">
            {now?.time ?? "\u00A0"}
          </span>
          <span className="font-heading text-2xl font-bold leading-8 text-text">{now?.date ?? "\u00A0"}</span>

          {/* Who's in, grouped so state is read from position rather than a sentence. */}
          <div className="mt-6 flex min-w-0 items-end gap-6">
            <span className="flex flex-none flex-col gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-text">
                <Icon name="home" size={12} strokeWidth={2.5} />
                Home
              </span>
              <span className="flex gap-2.5">
                {AT_HOME.map((p) => (
                  <Avatar key={p.key} who={p.key} size={48} />
                ))}
              </span>
            </span>

            <span className="h-12 w-px flex-none" style={{ background: "#D8DFEC" }} />

            <span className="flex min-w-0 flex-col gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-text">
                <Icon name="exit" size={12} strokeWidth={2.5} />
                Out
              </span>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex flex-none">
                  {OUT.map((p, j) => (
                    <span key={p.key} style={{ marginLeft: j ? -8 : 0 }}>
                      <Avatar who={p.key} size={48} ring="var(--color-bg)" />
                    </span>
                  ))}
                </span>
                <span className="min-w-0 truncate text-sm leading-5 text-neutral-400">
                  {OUT.map((p) => `${p.name} ${p.back?.replace(/^back /, "") ?? ""}`).join(" · ")}
                </span>
              </span>
            </span>
          </div>

          {/* A note to the house. Absent entirely when nobody has left one. */}
          {HOUSE_NOTE ? (
            <span className="mt-4 inline-flex max-w-full items-center gap-3 self-start rounded-xl bg-surface px-[18px] py-3 shadow-card">
              <Icon name="pen" size={16} className="flex-none text-accent" />
              <span className="min-w-0 text-[15px] font-semibold leading-5 text-text">{HOUSE_NOTE.text}</span>
              <span className="flex-none text-[13px] leading-[18px] text-ink-muted">
                {HOUSE_NOTE.by} · {HOUSE_NOTE.at}
              </span>
            </span>
          ) : null}
        </div>

        {/* The household's shared day — Public content only. */}
        <div className="flex w-[480px] min-w-0 flex-none flex-col rounded-[20px] bg-surface p-5 shadow-card max-[1200px]:w-[380px]">
          <div className="flex flex-none items-center justify-between gap-2 px-2 pb-3.5 pt-0.5">
            <span className="flex items-center gap-2.5">
              <Icon name="calendar" size={16} className="text-accent" />
              <Eyebrow>Today, in this house</Eyebrow>
            </span>
            <Eyebrow tone="muted">{TODAY.length} on</Eyebrow>
          </div>

          <div className="flex min-h-0 flex-grow flex-col">
            {TODAY.map((entry, i) => (
              <div
                key={entry.time}
                className={`flex min-w-0 flex-grow items-center gap-4 px-2 py-2.5 ${i > 0 ? "border-t border-divider" : ""}`}
              >
                <span
                  className={`w-[52px] flex-none text-[15px] font-semibold leading-5 tabular-nums ${
                    entry.restricted ? "text-ink-muted" : "text-text"
                  }`}
                >
                  {entry.time}
                </span>
                <span className="flex min-w-0 flex-grow flex-col gap-0.5">
                  <span
                    className={`text-[15px] font-semibold leading-5 ${entry.restricted ? "text-ink-muted" : "text-text"}`}
                  >
                    {entry.title}
                  </span>
                  <span className="text-[13px] leading-[18px] text-ink-muted">{entry.detail}</span>
                </span>
                {entry.restricted ? (
                  <span className="flex flex-none items-center gap-1.5 rounded-full bg-bg px-3 py-1.5">
                    <Icon name="lock" size={13} className="text-ink-muted" />
                    <Eyebrow tone="muted">Restricted</Eyebrow>
                  </span>
                ) : (
                  <span className="flex flex-none">
                    {entry.who.map((who, j) => (
                      <span key={who} style={{ marginLeft: j ? -8 : 0 }}>
                        <Avatar who={who} size={30} ring="var(--color-surface)" />
                      </span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Three cards, one fact each. */}
      <div className="grid flex-none grid-cols-3 gap-3">
        <Card>
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Icon name="clock" size={14} strokeWidth={2.5} className="text-accent" />
              <Eyebrow>Next up</Eyebrow>
            </span>
            <span className="text-[13px] font-semibold leading-[18px] text-text tabular-nums">
              {HOME_CARDS.nextUp.at}
            </span>
          </span>
          <span className="font-heading text-xl font-bold leading-7 text-text">{HOME_CARDS.nextUp.title}</span>
          <span className="text-[13px] leading-[18px] text-ink-muted">{HOME_CARDS.nextUp.detail}</span>
        </Card>

        <Card>
          <span className="flex items-center gap-1.5">
            <Icon name="check" size={14} strokeWidth={2.5} className="text-accent" />
            <Eyebrow>{HOME_CARDS.jobs.left} jobs left today</Eyebrow>
          </span>
          <span className="flex items-center gap-2.5">
            <span className="flex flex-none">
              {PEOPLE.slice(0, 4).map((p, j) => (
                <span key={p.key} style={{ marginLeft: j ? -8 : 0 }}>
                  <Avatar who={p.key} size={32} ring="var(--color-surface)" />
                </span>
              ))}
            </span>
            <span className="min-w-0 truncate text-[13px] leading-[18px] text-ink-muted">
              <span className="font-semibold text-text">{HOME_CARDS.jobs.leader}</span> has the most to do
            </span>
          </span>
        </Card>

        <NextReminderCard />
      </div>
    </BaseLayer>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[116px] flex-col justify-center gap-1.5 rounded-xl bg-surface px-5 py-4 shadow-card">
      {children}
    </div>
  );
}
