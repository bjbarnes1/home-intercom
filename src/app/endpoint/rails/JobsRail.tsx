"use client";

import { identStyle } from "@/lib/color/identity";
import type { JobBoard } from "../types";

interface Props {
  board: JobBoard | null;
  onTick: (choreId: string) => void;
}

export default function JobsRail({ board, onTick }: Props) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden px-7 pb-6">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h3 className="m-0">Jobs</h3>
          <div className="text-xs text-neutral-500">
            Tap a job when it&apos;s done · resets each week
          </div>
        </div>
        <div className="text-right">
          <div className="font-heading text-2xl font-medium">
            {board?.weekDoneTotal ?? 0}
          </div>
          <div className="text-[11px] text-neutral-500">done this week</div>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-4 gap-3 overflow-hidden">
        {(board?.kids ?? []).map((k) => {
          const pct = k.total ? Math.round((k.doneToday / k.total) * 100) : 0;
          return (
            <div
              key={k.id}
              className="hi-tinted card flex min-h-0 flex-col gap-2.5 p-3.5"
              style={identStyle(k.name)}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="grid h-9 w-9 flex-none place-items-center rounded-full font-heading text-base font-medium"
                  style={{
                    background: "var(--hi-tint-22)",
                    color: "var(--hi-ident)",
                  }}
                >
                  {k.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-heading text-[17px] font-medium">{k.name}</div>
                  <div
                    className="flex items-center gap-1 text-[11px]"
                    style={{ color: "var(--hi-ident)" }}
                  >
                    <i className="ph-fill ph-flame text-xs" />
                    {k.streak > 0 ? `${k.streak}-day streak` : "No streak yet"}
                  </div>
                </div>
              </div>
              <div className="h-1 overflow-hidden rounded bg-neutral-800">
                <div
                  className="h-full rounded transition-all"
                  style={{ width: `${pct}%`, background: "var(--hi-ident)" }}
                />
              </div>
              <div className="text-[11px] text-neutral-500">
                {k.doneToday} of {k.total} today
              </div>
              <div className="no-scrollbar flex flex-col gap-1.5 overflow-auto">
                {k.chores.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onTick(c.id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-neutral-800"
                    style={
                      c.done
                        ? { background: "var(--hi-tint-14)" }
                        : undefined
                    }
                  >
                    <span
                      className="grid h-5 w-5 flex-none place-items-center rounded-md border"
                      style={
                        c.done
                          ? {
                              borderColor: "var(--hi-ident)",
                              background: "var(--hi-ident)",
                              color: "#141221",
                            }
                          : { borderColor: "var(--color-neutral-600)" }
                      }
                    >
                      {c.done && <i className="ph-bold ph-check text-[11px]" />}
                    </span>
                    <span
                      className={
                        c.done ? "text-neutral-500 line-through" : "text-neutral-200"
                      }
                    >
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {(!board || board.kids.length === 0) && (
          <div className="col-span-4 grid place-items-center text-neutral-500">
            No kids set up yet.
          </div>
        )}
      </div>
    </div>
  );
}
