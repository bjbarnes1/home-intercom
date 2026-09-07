"use client";

import { identStyle } from "@/lib/color/identity";

export interface MessageRow {
  id: string;
  type: "PAGE" | "CALL" | "BROADCAST" | "ANNOUNCE";
  kindLabel: string;
  outcome: string;
  summary: string | null;
  from: string | null;
  target: string | null;
  startedAt: string;
  endedAt: string | null;
}

interface Props {
  messages: MessageRow[];
}

function iconFor(type: MessageRow["type"]): string {
  switch (type) {
    case "PAGE":
      return "ph-broadcast";
    case "CALL":
      return "ph-phone-call";
    case "BROADCAST":
      return "ph-megaphone-simple";
    case "ANNOUNCE":
      return "ph-chat-circle-text";
    default: {
      const _n: never = type;
      return _n;
    }
  }
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

/**
 * Household intercom log: pages, calls, live broadcasts, text announces.
 */
export default function MessagesRail({ messages }: Props) {
  return (
    <div className="flex-1 overflow-auto px-7 pb-8">
      <h3 className="mb-1 mt-1">Messages</h3>
      <p className="mb-5 text-xs text-neutral-500">
        Pages, calls, and broadcasts for this home.
      </p>
      {messages.length === 0 && (
        <div className="py-16 text-center text-neutral-500">
          <i className="ph ph-chat-circle mb-2 block text-3xl text-accent-400" />
          <div className="text-sm">Nothing yet — talk from a parent phone.</div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className="hi-tinted card flex items-start gap-3 p-3"
            style={identStyle(m.from ?? m.target ?? m.kindLabel)}
          >
            <i
              className={`ph ${iconFor(m.type)} mt-0.5 text-xl`}
              style={{ color: "var(--hi-ident)" }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-heading text-[15px] font-medium">
                  {m.kindLabel}
                  {m.from ? ` · ${m.from}` : ""}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-500">
                  {timeLabel(m.startedAt)}
                </span>
              </div>
              {m.summary && (
                <div className="mt-0.5 line-clamp-2 text-sm text-neutral-300">
                  {m.summary}
                </div>
              )}
              <div className="mt-1 text-[11px] text-neutral-500">
                {m.target ? `To ${m.target}` : "Household"}
                {" · "}
                {m.outcome.toLowerCase()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
