import Link from "next/link";
import Avatar from "../_components/Avatar";
import BaseLayer, { Eyebrow, Hero } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import { CONVERSATIONS, PEOPLE } from "../data";

/**
 * Open Line — messages and intercom on one surface.
 *
 * Tap a conversation opens it, hold calls that person or group. Quick Dial is the
 * one exception: its whole purpose is calling, so a tap calls immediately and
 * there is no "open" step to shortcut past.
 *
 * Note for the real build: these previews are Household content on a surface
 * currently reachable from the public home with nobody signed in. Either the list
 * drops previews until someone identifies, or opening this raises the profile
 * switcher — see the design system's Public & private section.
 */
export default function OpenLine() {
  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)}>
      <Hero title="Open Line" eyebrow="Messages & intercom, together" />

      <div className="flex flex-none flex-col gap-2.5">
        <span className="px-1">
          <Eyebrow tone="ink">Quick dial · tap to call</Eyebrow>
        </span>
        <div className="flex items-center gap-5 overflow-hidden rounded-[20px] bg-surface px-6 py-5 shadow-card">
          {PEOPLE.map((p) => (
            <button
              key={p.key}
              type="button"
              className="flex flex-none cursor-pointer flex-col items-center gap-2.5 border-none bg-transparent p-0 transition-transform active:scale-[0.97]"
            >
              <Avatar who={p.key} size={64} />
              <span className="text-xs font-medium leading-4 text-text">{p.name}</span>
            </button>
          ))}

          <span className="mx-1 h-16 w-px flex-none" style={{ background: "rgba(15,23,42,0.10)" }} />

          <button
            type="button"
            className="flex flex-grow cursor-pointer flex-col items-center gap-2.5 border-none bg-transparent p-0 transition-transform active:scale-[0.97]"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white">
              <Icon name="broadcast" size={26} />
            </span>
            <span className="text-xs font-semibold leading-4 text-accent">Broadcast to everyone</span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-grow flex-col gap-2.5">
        <div className="flex flex-none items-baseline justify-between px-1">
          <Eyebrow tone="ink">Conversations</Eyebrow>
          <Eyebrow tone="muted">Tap to open · hold to call</Eyebrow>
        </div>

        <div className="flex min-h-0 flex-grow flex-col gap-2.5 overflow-hidden">
          {CONVERSATIONS.map((c) => (
            <Link
              key={c.id}
              href="/hub/call"
              className={`flex min-h-[72px] flex-grow items-center justify-between gap-4 rounded-xl px-5 shadow-card transition-transform active:scale-[0.99] ${
                c.pinned ? "bg-accent" : "bg-surface"
              }`}
            >
              <span className="flex min-w-0 items-center gap-3.5">
                <span className="flex flex-none">
                  {c.members.map((who, j) => (
                    <span key={who} style={{ marginLeft: j ? -10 : 0 }}>
                      <Avatar
                        who={who}
                        size={c.members.length > 1 ? 40 : 48}
                        ring={c.pinned ? "var(--color-accent)" : "var(--color-surface)"}
                      />
                    </span>
                  ))}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span
                      className={`font-heading text-xl font-bold leading-6 ${c.pinned ? "text-white" : "text-text"}`}
                    >
                      {c.name}
                    </span>
                    {c.pinned ? <Icon name="check" size={13} className="text-white" /> : null}
                  </span>
                  <span
                    className={`truncate text-[13px] leading-[18px] ${c.pinned ? "text-white" : "text-ink-muted"}`}
                  >
                    {c.speaker ? <span className="font-semibold">{c.speaker}: </span> : null}
                    {c.preview}
                  </span>
                </span>
              </span>
              <span className="flex flex-none items-center gap-3.5">
                <span
                  className={`text-[11px] font-bold uppercase leading-4 tracking-[0.08em] ${
                    c.pinned ? "text-white" : "text-ink-muted"
                  }`}
                >
                  {c.when}
                </span>
                {c.unread ? (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: c.pinned ? "#FFFFFF" : "var(--color-accent)" }}
                  />
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </BaseLayer>
  );
}
