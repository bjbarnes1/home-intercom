import Avatar from "../_components/Avatar";
import BaseLayer, { Eyebrow } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import { LOOSE_ENDS, ME, type LooseEnd } from "../data";

/**
 * The personal welcome screen — the first thing after identifying.
 *
 * The only Base Layer screen with a known audience of one, which is why Loose
 * Ends lives here and never on the ambient home. Same shape as Home, so the two
 * read as one product in different states.
 */
export default function PersonalHome() {
  return (
    <BaseLayer active={{ who: ME.key, name: ME.name }}>
      <div className="flex min-h-0 flex-grow items-stretch gap-8">
        <div className="flex min-w-0 flex-grow flex-col justify-center gap-2.5">
          <span className="font-heading text-[clamp(48px,6.5vw,76px)] font-extrabold leading-none tracking-[-0.035em] text-text">
            {ME.greeting}
          </span>
          <span className="font-heading text-2xl font-bold leading-8 text-text">{ME.date}</span>
          <span className="text-base font-medium leading-6 text-neutral-400">{ME.line}</span>
        </div>

        <div className="flex w-[480px] min-w-0 flex-none flex-col rounded-[20px] bg-surface p-5 shadow-card max-[1200px]:w-[400px]">
          <div className="flex flex-none items-center justify-between gap-2 px-2 pb-3.5 pt-0.5">
            <span className="flex items-center gap-2.5">
              <Icon name="sparkle" size={16} className="text-accent" />
              <Eyebrow>Loose ends</Eyebrow>
            </span>
            <Eyebrow tone="muted">{LOOSE_ENDS.length} to tie up</Eyebrow>
          </div>

          <div className="flex min-h-0 flex-grow flex-col">
            {LOOSE_ENDS.map((item, i) => (
              <div
                key={item.id}
                className={`flex min-w-0 flex-grow items-center gap-3 px-2 py-2.5 ${i > 0 ? "border-t border-divider" : ""}`}
              >
                <span className="flex min-w-0 flex-grow flex-col gap-1.5">
                  <span className="text-[15px] font-semibold leading-5 text-text">{item.title}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <OriginChip origin={item.origin} />
                    <span className="min-w-0 truncate text-xs leading-4 text-ink-muted">{item.source}</span>
                  </span>
                </span>
                <button
                  type="button"
                  className="h-11 flex-none cursor-pointer rounded-full border-none bg-accent px-[18px] text-[13px] font-bold text-white transition-transform active:scale-[0.97]"
                >
                  {item.action}
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss: ${item.title}`}
                  className="flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-ink-muted transition-transform active:scale-[0.97]"
                >
                  <Icon name="close" size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid flex-none grid-cols-3 gap-3">
        <div className="flex h-[116px] flex-col justify-center gap-1.5 rounded-xl bg-surface px-5 py-4 shadow-card">
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <Icon name="clock" size={14} strokeWidth={2.5} className="text-accent" />
              <Eyebrow>Your next</Eyebrow>
            </span>
            <span className="text-[13px] font-semibold leading-[18px] text-text tabular-nums">{ME.next.at}</span>
          </span>
          <span className="font-heading text-xl font-bold leading-7 text-text">{ME.next.title}</span>
          <span className="text-[13px] leading-[18px] text-ink-muted">{ME.next.detail}</span>
        </div>

        <div className="flex h-[116px] flex-col justify-center gap-1.5 rounded-xl bg-surface px-5 py-4 shadow-card">
          <span className="flex items-center gap-1.5">
            <Icon name="check" size={14} strokeWidth={2.5} className="text-accent" />
            <Eyebrow>{ME.jobs.left} jobs left</Eyebrow>
          </span>
          <span className="font-heading text-xl font-bold leading-7 text-text">{ME.jobs.title}</span>
          <span className="text-[13px] leading-[18px] text-ink-muted">{ME.jobs.detail}</span>
        </div>

        <div className="flex h-[116px] flex-col justify-center gap-2 rounded-xl bg-surface px-5 py-4 shadow-card">
          <span className="flex items-center gap-1.5">
            <Icon name="messages" size={14} strokeWidth={2.5} className="text-accent" />
            <Eyebrow tone="muted">
              From {ME.message.from} · {ME.message.at}
            </Eyebrow>
          </span>
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar who={ME.message.from} size={32} />
            <span className="min-w-0 truncate text-[15px] font-semibold leading-5 text-text">{ME.message.text}</span>
          </span>
        </div>
      </div>
    </BaseLayer>
  );
}

/**
 * Where an item came from. The chip shape and ink are identical for all three;
 * only the mark inside changes, so colour keeps meaning a person and nothing else.
 */
function OriginChip({ origin }: { origin: LooseEnd["origin"] }) {
  const accentTint = origin.kind === "ai";
  return (
    <span
      className="flex flex-none items-center gap-1.5 rounded-full px-2.5 py-0.5"
      style={{ background: accentTint ? "rgba(59,92,246,0.10)" : "var(--color-bg)" }}
    >
      {origin.kind === "email" ? <Icon name="mail" size={12} strokeWidth={2.2} className="text-ink-muted" /> : null}
      {origin.kind === "ai" ? <Icon name="sparkle" size={12} strokeWidth={2.2} className="text-accent" /> : null}
      {origin.kind === "person" ? <Avatar who={origin.who} size={16} /> : null}
      <span className="text-[11px] font-semibold leading-4 text-text">
        {origin.kind === "email" ? "Email" : origin.kind === "ai" ? "AI note" : `From ${origin.who}`}
      </span>
    </span>
  );
}
