import { ident } from "@/lib/color/identity";
import BaseLayer, { Eyebrow, Hero } from "../_components/BaseLayer";
import Icon from "../_components/Icon";
import { BROWSE, NOW_PLAYING, PEOPLE, RECENT_TRACKS, SPEAKERS } from "../data";

/** Music — what is playing, and where. */
export default function Music() {
  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)}>
      <Hero title="Music" eyebrow="Playing across the house" />

      <div className="flex flex-none items-center gap-6 rounded-[20px] bg-surface p-6 shadow-card">
        <span
          role="img"
          aria-label="Album artwork placeholder"
          className="flex h-[120px] w-[120px] flex-none items-center justify-center rounded-[20px]"
          style={{ background: "rgba(59,92,246,0.10)" }}
        >
          <Icon name="music" size={40} className="text-accent" />
        </span>

        <span className="flex min-w-0 flex-grow flex-col gap-3">
          <span className="flex items-start justify-between gap-4">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-heading text-xl font-bold leading-7 text-text">{NOW_PLAYING.track}</span>
              <span className="truncate text-[13px] leading-[18px] text-ink-muted">{NOW_PLAYING.artist}</span>
            </span>
            <span
              className="flex flex-none items-center gap-2 rounded-full px-3.5 py-1.5"
              style={{ background: "rgba(59,92,246,0.10)" }}
            >
              <Icon name="home" size={15} className="text-accent" />
              <span className="text-xs font-semibold leading-4 text-text">{NOW_PLAYING.room}</span>
            </span>
          </span>

          <span className="flex items-center gap-3">
            <span className="w-[34px] flex-none text-xs font-medium leading-4 text-ink-muted tabular-nums">
              {NOW_PLAYING.elapsed}
            </span>
            <span className="flex h-1.5 flex-grow overflow-hidden rounded-full" style={{ background: "rgba(15,23,42,0.08)" }}>
              <span className="bg-accent" style={{ width: `${NOW_PLAYING.progress}%` }} />
            </span>
            <span className="w-[34px] flex-none text-right text-xs font-medium leading-4 text-ink-muted tabular-nums">
              {NOW_PLAYING.total}
            </span>
          </span>

          <span className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <Transport label="Previous track" icon="prev" />
              <button
                type="button"
                aria-label="Pause"
                className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-none bg-accent text-white transition-transform active:scale-[0.97]"
              >
                <Icon name="pause" size={22} />
              </button>
              <Transport label="Next track" icon="next" />
              <Transport label="Save to favourites" icon="heart" muted />
            </span>

            <span className="flex w-44 items-center gap-2.5">
              <Icon name="speaker" size={18} className="flex-none text-ink-muted" />
              <span className="flex h-1.5 flex-grow overflow-hidden rounded-full" style={{ background: "rgba(15,23,42,0.08)" }}>
                <span className="bg-accent" style={{ width: `${NOW_PLAYING.volume}%` }} />
              </span>
            </span>
          </span>
        </span>
      </div>

      <div className="flex min-h-0 flex-grow gap-5">
        <div className="flex min-w-0 flex-grow flex-col gap-2">
          <span className="px-1">
            <Eyebrow tone="ink">Browse</Eyebrow>
          </span>
          <div className="grid flex-none grid-cols-5 gap-3">
            {BROWSE.map((name) => (
              <button
                key={name}
                type="button"
                className="flex h-[100px] cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-none bg-surface shadow-card transition-transform active:scale-[0.97]"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: "rgba(59,92,246,0.10)" }}
                >
                  <Icon name="music" size={19} className="text-accent" />
                </span>
                <span className="px-1 text-center text-[13px] font-semibold leading-[18px] text-text">{name}</span>
              </button>
            ))}
          </div>

          <span className="px-1 pt-2">
            <Eyebrow tone="ink">Recently played</Eyebrow>
          </span>
          <div className="flex min-h-0 flex-grow flex-col gap-0.5 overflow-y-auto rounded-xl bg-surface p-2 shadow-card">
            {RECENT_TRACKS.map((t) => (
              <button
                key={t.title}
                type="button"
                className="flex cursor-pointer items-center gap-3.5 rounded-xl border-none bg-transparent px-3 py-2 text-left transition-colors hover:bg-bg"
              >
                <span
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
                  style={{ background: "rgba(59,92,246,0.10)" }}
                >
                  <Icon name="music" size={17} className="text-accent" />
                </span>
                <span className="flex min-w-0 flex-grow flex-col">
                  <span className="truncate text-[13px] font-semibold leading-[18px] text-text">{t.title}</span>
                  <span className="truncate text-xs leading-4 text-ink-muted">{t.artist}</span>
                </span>
                <span className="flex-none text-xs font-medium leading-4 text-ink-muted tabular-nums">{t.length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-[300px] min-w-0 flex-none flex-col gap-2 max-[1200px]:w-[240px]">
          <span className="px-1">
            <Eyebrow tone="ink">Playing on</Eyebrow>
          </span>
          <div className="flex min-h-0 flex-grow flex-col gap-1 overflow-hidden rounded-xl bg-surface p-2 shadow-card">
            {SPEAKERS.map((s) => (
              <button
                key={s.name}
                type="button"
                aria-pressed={!!s.playing}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border-none px-3.5 py-2.5 text-left transition-colors ${
                  s.playing ? "" : "bg-transparent hover:bg-bg"
                }`}
                style={s.playing ? { background: "var(--color-accent)" } : undefined}
              >
                <span
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-xl"
                  style={{
                    background: s.playing ? "rgba(255,255,255,0.22)" : "rgba(59,92,246,0.10)",
                    color: s.playing ? "#FFFFFF" : (s.key ? ident(s.key) : "var(--color-accent)"),
                  }}
                >
                  <Icon name="speaker" size={17} />
                </span>
                <span className="flex min-w-0 flex-grow flex-col">
                  <span className={`truncate text-[13px] font-semibold leading-[18px] ${s.playing ? "text-white" : "text-text"}`}>
                    {s.name}
                  </span>
                  <span className={`truncate text-xs leading-4 ${s.playing ? "text-white" : "text-ink-muted"}`}>
                    {s.where}
                  </span>
                </span>
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: s.playing ? "#FFFFFF" : "rgba(15,23,42,0.18)" }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </BaseLayer>
  );
}

function Transport({ label, icon, muted }: { label: string; icon: "prev" | "next" | "heart"; muted?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border-none bg-transparent transition-transform active:scale-[0.97] ${
        muted ? "text-ink-muted" : "text-text"
      }`}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}
