"use client";

import { ident, identStyle } from "@/lib/color/identity";
import type { Schedule } from "../types";

interface Props {
  schedule: Schedule | null;
  schedDay: number;
  onSelectDay: (index: number) => void;
}

export default function ScheduleRail({ schedule, schedDay, onSelectDay }: Props) {
  const day = schedule?.days[schedDay];
  return (
    <div className="flex flex-1 flex-col overflow-hidden px-7 pb-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="m-0">
            {day
              ? schedDay === 0
                ? "Today"
                : `${day.weekday} ${day.dayNum}`
              : "Schedule"}
          </h3>
          <div className="text-xs text-neutral-500">
            {day?.count
              ? `${day.count} ${day.count === 1 ? "event" : "events"}`
              : "Nothing booked"}
          </div>
        </div>
        <div className="flex gap-1.5">
          {(schedule?.days ?? []).map((d, i) => (
            <button
              key={d.day}
              onClick={() => onSelectDay(i)}
              className={`flex w-11 flex-col items-center gap-0.5 rounded-lg py-1.5 transition ${
                i === schedDay
                  ? "bg-accent text-[#141221]"
                  : "text-neutral-400 hover:bg-surface"
              }`}
            >
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                {d.weekday}
              </span>
              <span className="font-heading text-[17px] font-medium">{d.dayNum}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="no-scrollbar flex-1 overflow-auto">
        {day?.events.length ? (
          day.events.map((e) => (
            <div
              key={e.id}
              className="hi-tinted flex items-center gap-4 border-b border-divider py-3.5"
              style={identStyle(e.who)}
            >
              <div
                className="w-20 flex-none font-heading text-[17px] font-medium"
                style={{ color: "var(--hi-ident)" }}
              >
                {e.time}
              </div>
              <div
                className="h-9 w-[3px] flex-none rounded"
                style={{ background: e.who ? ident(e.who) : e.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="font-heading text-lg font-medium">{e.title}</div>
                {e.who && (
                  <div className="mt-0.5 text-[13px] text-neutral-500">{e.who}</div>
                )}
              </div>
              {e.who && <span className="tag tag-ident">{e.who}</span>}
            </div>
          ))
        ) : (
          <div className="grid place-items-center py-16 text-center text-neutral-500">
            <div>
              <i className="ph ph-cloud-sun mb-2 block text-3xl text-accent-400" />
              <div className="text-[17px]">
                Nothing booked. A rare and beautiful thing.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
