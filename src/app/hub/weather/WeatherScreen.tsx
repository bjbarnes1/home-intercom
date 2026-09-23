"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BaseLayer, { Eyebrow, Hero } from "../_components/BaseLayer";
import Icon, { type IconName } from "../_components/Icon";
import { PEOPLE } from "../data";
import type { Forecast, Place } from "@/lib/weather/openMeteo";
import type { PlaceMatch } from "@/lib/weather/geocode";

/**
 * Weather.
 *
 * Research on weather apps is consistent: the two things people check are
 * temperature and chance of rain, and the reason they check is to decide what
 * to wear and whether to take a coat. So rain probability is the hero — bar
 * height *is* the chance of rain — and "Dressed for it" is a first-class band
 * rather than a garnish.
 *
 * The advice comes from apparent temperature, never air temperature: the
 * still-18° versus windy-18° case is the whole reason the band exists.
 *
 * Saved places live in this browser rather than the database, because the Hub
 * is one shared screen in one house — what it is pointed at is a property of
 * the device, not of any person.
 */

const SAVED_KEY = "famos.weather.saved";
const REFRESH_MS = 10 * 60 * 1000;

export default function WeatherScreen({ initial, home }: { initial: Forecast | null; home: Place }) {
  const [forecast, setForecast] = useState<Forecast | null>(initial);
  const [where, setWhere] = useState<Place>(home);
  const [saved, setSaved] = useState<Place[]>([home]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  // Saved places are a device preference; a browser that refuses storage just
  // gets the household's own location, which is the useful default anyway.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const places = parsed.filter(isPlace);
      if (places.length) setSaved(dedupe([home, ...places]));
    } catch {
      /* no saved places */
    }
  }, [home]);

  const persist = useCallback((places: Place[]) => {
    setSaved(places);
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(places.filter((p) => p.place !== home.place)));
    } catch {
      /* the list still works for this session */
    }
  }, [home.place]);

  const load = useCallback(async (place: Place) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/weather?lat=${place.latitude}&lon=${place.longitude}&place=${encodeURIComponent(place.place)}`,
        { cache: "no-store" },
      );
      // Throttled or failed: keep what is on screen, as below.
      if (!res.ok) return;
      const json = (await res.json()) as { forecast: Forecast | null };
      setForecast(json.forecast);
    } catch {
      // Keep whatever is on screen: a slightly old forecast beats a blank card.
    } finally {
      setLoading(false);
    }
  }, []);

  const show = useCallback(
    (place: Place) => {
      setWhere(place);
      void load(place);
    },
    [load],
  );

  // A wall display is left on. Re-read on the same cadence as the upstream cache.
  useEffect(() => {
    const id = window.setInterval(() => void load(where), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load, where]);

  const w = forecast;

  return (
    <BaseLayer people={PEOPLE.map((p) => p.key)} weatherActive>
      <Hero title="Weather" eyebrow={w ? w.context : "Forecast unavailable"}>
        <span className="flex min-w-0 flex-none items-center gap-2">
          {saved.map((place) => (
            <button
              key={`${place.latitude},${place.longitude}`}
              type="button"
              aria-pressed={place.place === where.place}
              onClick={() => show(place)}
              className={`h-11 max-w-[180px] cursor-pointer truncate rounded-full border-none px-[18px] text-[13px] font-semibold transition-transform active:scale-[0.97] ${
                place.place === where.place ? "bg-accent text-white" : "bg-surface text-text shadow-card"
              }`}
            >
              {place.place}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSearching(true)}
            className="flex h-11 flex-none cursor-pointer items-center gap-2 rounded-full border-none bg-surface px-4 text-[13px] font-semibold text-text transition-transform active:scale-[0.97]"
            style={{ boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.1)" }}
          >
            <Icon name="search" size={16} />
            Search
          </button>
        </span>
      </Hero>

      {/* Advisory in ink, with the level carried in words — the system has no warning colour. */}
      {w?.warning ? (
        <div className="flex h-13 flex-none items-center gap-3.5 rounded-xl px-5 py-3" style={{ background: "#0F172A" }}>
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

      {!w ? (
        <div className="flex min-h-0 flex-grow flex-col items-center justify-center gap-2 rounded-[20px] bg-surface shadow-card">
          <Icon name="weather" size={44} strokeWidth={1.6} className="text-ink-muted" />
          <span className="font-heading text-xl font-bold leading-7 text-text">No forecast right now</span>
          <span className="text-[15px] leading-5 text-ink-muted">
            The weather service is unreachable. Nothing here is stale — there is simply nothing to show.
          </span>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-grow gap-4" style={loading ? { opacity: 0.6 } : undefined}>
            <div className="flex min-w-0 flex-grow flex-col justify-center gap-4 rounded-[20px] bg-surface px-6 py-5 shadow-card">
              <div className="flex min-w-0 items-center gap-6">
                <Icon name={w.icon as IconName} size={76} strokeWidth={1.6} className="flex-none text-accent" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-baseline gap-3.5">
                    <span className="font-heading text-[76px] font-extrabold leading-none tracking-[-0.04em] text-text tabular-nums">
                      {w.temp}°
                    </span>
                    <span className="font-heading text-xl font-bold leading-7 text-text">{w.condition}</span>
                  </span>
                  <span className="text-[15px] leading-5 text-ink-muted">
                    Feels like <span className="font-semibold text-text">{w.feelsLike}°</span>
                    {w.feelsNote ? ` — ${w.feelsNote}` : null}
                  </span>
                </span>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <Stat label="High / low" value={`${w.high}° / ${w.low}°`} />
                <Stat label="Wind" value={w.wind} />
                <Stat label="UV" value={w.uv} />
                {w.sunset ? <Stat label="Sunset" value={w.sunset} /> : null}
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

              <div className="flex min-h-0 flex-grow flex-col justify-center gap-3 px-2">
                <span className="font-heading text-[28px] font-bold leading-9 tracking-tight text-text">
                  {w.dressed.advice}
                </span>
                <span className="text-[15px] leading-5 text-ink-muted">Because {w.dressed.why}.</span>
                {w.dressed.carry.length ? (
                  <span className="flex flex-wrap items-center gap-2 pt-1">
                    <Eyebrow tone="muted">Take</Eyebrow>
                    {w.dressed.carry.map((c) => (
                      <span key={c} className="rounded-full bg-bg px-3.5 py-2 text-[13px] font-semibold leading-5 text-text">
                        {c}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Bar height is chance of rain — the question people open a forecast to answer. */}
          <div className="flex h-[148px] flex-none flex-col gap-2.5 rounded-[20px] bg-surface px-6 pb-4 pt-3.5 shadow-card">
            <div className="flex flex-none items-center justify-between gap-2">
              <Eyebrow>Next hours · chance of rain</Eyebrow>
              {w.driest ? <Eyebrow tone="muted">Driest {w.driest}</Eyebrow> : null}
            </div>
            <div
              className="grid min-h-0 flex-grow items-end gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.max(w.hours.length, 1)}, minmax(0, 1fr))` }}
            >
              {w.hours.map((h) => (
                <span key={h.at} className="flex flex-col items-center gap-1.5">
                  <span className="text-xs font-semibold leading-4 text-text tabular-nums">{h.temp}°</span>
                  <span
                    className="flex h-11 w-full items-end overflow-hidden rounded-md"
                    style={{ background: "rgba(15,23,42,0.06)" }}
                    title={`${h.rain}% chance of rain`}
                  >
                    <span
                      className="w-full bg-accent transition-[height] duration-300"
                      style={{ height: `${h.rain}%` }}
                    />
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
                <span key={d.day} className={`flex items-center justify-center gap-3 rounded-xl ${i === 0 ? "bg-bg" : ""}`}>
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
        </>
      )}

      {searching ? (
        <PlaceSearch
          onClose={() => setSearching(false)}
          onPick={(match) => {
            const place: Place = { place: match.place, latitude: match.latitude, longitude: match.longitude };
            persist(dedupe([...saved, place]));
            show(place);
            setSearching(false);
          }}
        />
      ) : null}
    </BaseLayer>
  );
}

/** Search sits in the Overlay Card's clothes so it reads as an interruption, not a new place. */
function PlaceSearch({ onClose, onPick }: { onClose: () => void; onPick: (m: PlaceMatch) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceMatch[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    // Typing on a touch keyboard is slow; wait for a pause rather than firing
    // a geocode on every keystroke.
    const id = window.setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/weather/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const json = (await res.json()) as { results: PlaceMatch[] };
        setResults(json.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-8"
      style={{ background: "rgba(15,23,42,0.45)" }}
      onClick={onClose}
    >
      <div
        className="flex w-[560px] max-w-full flex-col gap-3 rounded-[24px] bg-surface-2 p-6 shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex items-center gap-3 rounded-full bg-bg px-5 py-3">
          <Icon name="search" size={18} className="flex-none text-ink-muted" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a town or city"
            aria-label="Search for a town or city"
            className="min-w-0 flex-grow border-none bg-transparent text-base leading-6 text-text outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex-none cursor-pointer border-none bg-transparent text-ink-muted"
          >
            <Icon name="close" size={18} />
          </button>
        </span>

        <div className="flex max-h-[320px] flex-col overflow-y-auto">
          {results.map((r) => (
            <button
              key={`${r.latitude},${r.longitude}`}
              type="button"
              onClick={() => onPick(r)}
              className="flex cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent px-4 py-3 text-left transition-colors hover:bg-bg"
            >
              <Icon name="weather" size={18} className="flex-none text-accent" />
              <span className="flex min-w-0 flex-grow flex-col">
                <span className="truncate text-[15px] font-semibold leading-5 text-text">{r.place}</span>
                <span className="truncate text-[13px] leading-[18px] text-ink-muted">{r.region}</span>
              </span>
              <span className="flex-none text-[13px] leading-[18px] text-ink-muted tabular-nums">
                {formatDistance(r.distanceKm)}
              </span>
            </button>
          ))}
          {!results.length ? (
            <span className="px-4 py-3 text-[13px] leading-[18px] text-ink-muted">
              {busy ? "Looking…" : query.trim().length < 2 ? "Type at least two letters." : "Nothing found."}
            </span>
          ) : null}
        </div>
      </div>
    </div>
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

function isPlace(v: unknown): v is Place {
  const p = v as Place;
  return (
    !!p &&
    typeof p.place === "string" &&
    typeof p.latitude === "number" &&
    typeof p.longitude === "number"
  );
}

/** Same coordinates, one chip — searching for "Sydney" twice should not add it twice. */
function dedupe(places: Place[]): Place[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    const key = `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Near things in kilometres, far things rounded — nobody needs 11,842 km. */
function formatDistance(km: number): string {
  if (km < 1) return "here";
  if (km < 100) return `${Math.round(km)} km`;
  if (km < 1000) return `${Math.round(km / 10) * 10} km`;
  return `${Math.round(km / 100) * 100} km`;
}
