"use client";

import { reminderTime } from "@/lib/client/speak";
import type { EndpointReminder, JobBoard, Schedule } from "../types";

interface Props {
  clockBig: string;
  dateLong: string;
  schedule: Schedule | null;
  board: JobBoard | null;
  reminders: EndpointReminder[];
  onOpenSchedule: () => void;
  onOpenJobs: () => void;
  onOpenReminders: () => void;
}

export default function HomeRail({
  clockBig,
  dateLong,
  schedule,
  board,
  reminders,
  onOpenSchedule,
  onOpenJobs,
  onOpenReminders,
}: Props) {
  const openJobs = (board?.kids ?? []).reduce((n, k) => n + (k.total - k.doneToday), 0);

  return (
    <div className="flex flex-1 flex-col justify-center px-7 pb-8">
      <div className="font-heading text-[120px] font-medium leading-none tracking-tight">
        {clockBig}
      </div>
      <div className="mt-3 text-xl text-neutral-400">{dateLong}</div>
      <div className="mt-9 flex gap-3">
        <button onClick={onOpenSchedule} className="card card-hover flex-1 p-4 text-left">
          <div className="uplabel mb-1.5 text-accent">Next on the calendar</div>
          {schedule?.nextEvent ? (
            <>
              <div className="font-heading text-lg font-medium">
                {schedule.nextEvent.title}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {schedule.nextEvent.time}
                {schedule.nextEvent.who ? ` · ${schedule.nextEvent.who}` : ""}
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500">Nothing coming up</div>
          )}
        </button>
        <button onClick={onOpenJobs} className="card card-hover flex-1 p-4 text-left">
          <div className="uplabel mb-1.5 text-accent">Jobs still open</div>
          <div className="font-heading text-lg font-medium">
            {openJobs === 0 ? "All done" : `${openJobs} to go`}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {board?.weekDoneTotal ?? 0} done this week
          </div>
        </button>
        <button onClick={onOpenReminders} className="card card-hover flex-1 p-4 text-left">
          <div className="uplabel mb-1.5 text-accent">Next reminder</div>
          {reminders[0] ? (
            <>
              <div className="font-heading text-lg font-medium">
                {reminderTime(reminders[0])}
              </div>
              <div className="mt-0.5 text-xs text-neutral-500 line-clamp-1">
                {reminders[0].text}
              </div>
            </>
          ) : (
            <div className="text-sm text-neutral-500">None scheduled</div>
          )}
        </button>
      </div>
    </div>
  );
}
