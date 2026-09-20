import Avatar from "../_components/Avatar";
import BaseLayer, { Eyebrow, Hero } from "../_components/BaseLayer";
import Icon, { type IconName } from "../_components/Icon";
import { PEOPLE, WEATHER } from "../data";

/**
 * Weather.
 *
 * Research on weather apps is consistent: the two things people check are
 * temperature and chance of rain, and the reason they check is to decide what to
 * wear and whether to take a coat. So rain probability is the hero — bar height
 * *is* the chance of rain — and "Dressed for it" is a first-class band rather
 * than a garnish.
 *
 * Dressed-for-it advice is derived from apparent temperature (the 2001 wind-chill
 * revision), never air temperature — the still-18° vs windy-18° case is the whole
 * reason it exists — and it is anchored to each person's actual outings so it
 * does not go stale after a fortnight.
 */
export default function Weather() {
  const w = WEATHER;
  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)} weatherActive>
      <Hero title="Weather" eyebrow={`${w.place} · ${w.context}`}>
        <span className="flex flex-none items-center gap-2">
          {w.saved.map((place) => (
            <button
              key={place}
              type="button"
              aria-pressed={place === w.place}
              className={`h-11 cursor-pointer rounded-full border-none px-[18px] text-[13px] font-semibold transition-transform active:scale-[0.97] ${
                place === w.place ? "bg-accent text-white" : "bg-surface text-text shadow-card"
              }`}
            >
              {place}
            </button>
          ))}
          <button
            type="button"
            className="flex h-11 cursor-pointer items-center gap-2 rounded-full border-none bg-surface px-4 text-[13px] font-semibold text-text transition-transform active:scale-[0.97]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
          >
            <Icon name="search" size={16} />
            Search
          </button>
        </span>
      </Hero>

      {/* Warning in ink, with the level carried in words — the system has no warning colour. */}
      {w.warning ? (
        <div
          className="flex h-13 flex-none items-center gap-3.5 rounded-xl px-5 py-3"
          style={{ background: "#0F172A" }}
        >
          <Icon name="alert" size={20} className="flex-none text-white" />
          <span className="flex-none text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-white">
            {w.warning.level}
          </span>
          <span className="h-5 w-px flex-none" style={{ background: "rgba(255,255,255,0.25)" }} />
          <span className="min-w-0 truncate text-sm leading-5 text-white">{w.warning.detail}</span>
          <span className="ml-auto flex-none text-xs leading-4" style={{ color: "rgba(255,255,255,0.7)" }}>
            {w.warning.source}
          </span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-grow gap-4">
        <div className="flex min-w-0 flex-grow flex-col justify-center gap-4 rounded-[20px] bg-surface px-6 py-5 shadow-card">
          <div className="flex min-w-0 items-center gap-6">
            <Icon name="rain" size={76} strokeWidth={1.6} className="flex-none text-accent" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-baseline gap-3.5">
                <span className="font-heading text-[76px] font-extrabold leading-none tracking-[-0.04em] text-text tabular-nums">
                  {w.temp}°
                </span>
                <span className="font-heading text-xl font-bold leading-7 text-text">{w.condition}</span>
              </span>
              <span className="text-[15px] leading-5 text-ink-muted">
                Feels like <span className="font-semibold text-text">{w.feelsLike}°</span> — {w.feelsNote}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Stat label="High / low" value={`${w.high}° / ${w.low}°`} />
            <Stat label="Wind" value={w.wind} />
            <Stat label="UV" value={w.uv} />
            <Stat label="Sunset" value={w.sunset} />
          </div>
        </div>

        <div className="flex w-[520px] min-w-0 flex-none flex-col rounded-[20px] bg-surface p-5 shadow-card max-[1280px]:w-[420px]">
          <div className="flex flex-none items-center justify-between gap-2 px-2 pb-3 pt-0.5">
            <span className="flex items-center gap-2.5">
              <Icon name="shirt" size={16} className="text-accent" />
              <Eyebrow>Dressed for it</Eyebrow>
            </span>
            <Eyebrow tone="muted">From {w.feelsLike}° feels-like</Eyebrow>
          </div>
          <div className="flex min-h-0 flex-grow flex-col">
            {w.dressed.map((d, i) => (
              <div
                key={d.who}
                className={`flex min-w-0 flex-grow items-center gap-3.5 p-2 ${i > 0 ? "border-t border-divider" : ""}`}
              >
                <Avatar who={d.who} size={40} />
                <span className="flex min-w-0 flex-grow flex-col gap-0.5">
                  <span className="text-[15px] font-semibold leading-5 text-text">{d.advice}</span>
                  <span className="text-[13px] leading-[18px] text-ink-muted">
                    {d.who} · {d.why}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bar height is chance of rain — the question people open a forecast to answer. */}
      <div className="flex h-[148px] flex-none flex-col gap-2.5 rounded-[20px] bg-surface px-6 pb-4 pt-3.5 shadow-card">
        <div className="flex flex-none items-center justify-between gap-2">
          <Eyebrow>Today · chance of rain</Eyebrow>
          <Eyebrow tone="muted">Driest {w.driest}</Eyebrow>
        </div>
        <div className="grid min-h-0 flex-grow grid-cols-11 items-end gap-2">
          {w.hours.map((h) => (
            <span key={h.at} className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold leading-4 text-text tabular-nums">{h.temp}°</span>
              <span
                className="flex h-11 w-full items-end overflow-hidden rounded-md"
                style={{ background: "rgba(15,23,42,0.06)" }}
              >
                <span className="w-full bg-accent" style={{ height: `${h.rain}%` }} />
              </span>
              <span className="text-[11px] leading-4 text-ink-muted tabular-nums">{h.at}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex h-[132px] flex-none flex-col gap-2 rounded-[20px] bg-surface px-6 pb-4 pt-3.5 shadow-card">
        <Eyebrow>Next 7 days</Eyebrow>
        <div className="grid min-h-0 flex-grow grid-cols-7 gap-2">
          {w.week.map((d, i) => (
            <span
              key={d.day}
              className={`flex items-center justify-center gap-3 rounded-xl ${i === 0 ? "bg-bg" : ""}`}
            >
              <Icon
                name={d.icon as IconName}
                size={26}
                strokeWidth={1.8}
                className={i === 0 ? "text-accent" : "text-ink-muted"}
              />
              <span className="flex flex-col gap-px">
                <span className="text-xs font-bold uppercase leading-4 tracking-[0.08em] text-text">{d.day}</span>
                <span className="text-[15px] font-bold leading-5 text-text tabular-nums">
                  {d.high}° <span className="font-medium text-ink-muted">{d.low}°</span>
                </span>
                <span className="text-xs leading-4 text-ink-muted tabular-nums">{d.rain}% rain</span>
              </span>
            </span>
          ))}
        </div>
      </div>
    </BaseLayer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-bg px-3.5 py-2">
      <span className="text-[11px] font-bold uppercase leading-4 tracking-[0.08em] text-ink-muted">{label}</span>
      <span className="text-sm font-semibold leading-5 text-text tabular-nums">{value}</span>
    </span>
  );
}
