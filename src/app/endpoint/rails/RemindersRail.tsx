"use client";

import { reminderTime } from "@/lib/client/speak";
import type { EndpointReminder } from "../types";

interface Props {
  room: string;
  reminders: EndpointReminder[];
  onPlay: (r: EndpointReminder) => void;
}

export default function RemindersRail({ room, reminders, onPlay }: Props) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden px-7 pb-8">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="m-0">Reminders</h3>
          <div className="text-xs text-neutral-500">
            Spoken here on schedule · edit them on a parent&apos;s phone
          </div>
        </div>
        <span className="tag tag-outline whitespace-nowrap">{room} only</span>
      </div>
      <div className="no-scrollbar flex-1 overflow-auto">
        {reminders.length === 0 && (
          <div className="py-16 text-center text-neutral-500">
            <i className="ph ph-bell-simple mb-2 block text-3xl text-accent-400" />
            <div className="text-sm">Nothing scheduled for this room.</div>
          </div>
        )}
        {reminders.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-4 border-b border-divider py-3.5"
          >
            <div className="w-20 flex-none font-heading text-lg font-medium text-accent-300">
              {reminderTime(r)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[17px]">{r.text}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {r.cron ? "Repeats daily" : "Once"}
              </div>
            </div>
            <button onClick={() => onPlay(r)} className="btn btn-secondary min-h-11">
              <i className="ph ph-play text-[15px]" />
              Play now
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
