import { reportWarning } from "@/lib/errors/report";
import { deriveAdvisory, dressFor, driestWindow } from "@/lib/weather/advice";
import { describeWeather, roundTemp, type WeatherIcon } from "@/lib/weather/wmo";

/**
 * Forecast from Open-Meteo — no API key and no account, which is why the Hub's
 * weather works out of the box. Set WEATHER_LATITUDE / WEATHER_LONGITUDE /
 * WEATHER_PLACE to move the default location off Sydney.
 *
 * The network shape is deliberately not re-exported: everything the screens see
 * is already rounded, labelled and ordered, so no component has to know what a
 * WMO code is or which hour the array starts at.
 */

export interface HourSlot {
  /** Two-digit local hour, e.g. "14". */
  at: string;
  temp: number;
  /** Chance of rain, 0–100. */
  rain: number;
}

export interface DaySlot {
  /** "Today", then "Tue", "Wed"… */
  day: string;
  icon: WeatherIcon;
  high: number;
  low: number;
  rain: number;
}

export interface Forecast {
  place: string;
  /** Provenance line under the title. */
  context: string;
  temp: number;
  feelsLike: number;
  condition: string;
  icon: WeatherIcon;
  /** Short clause explaining a feels-like gap, or null when there is none. */
  feelsNote: string | null;
  high: number;
  low: number;
  wind: string;
  uv: string;
  sunset: string;
  /** "11:00–14:00", or null when no stretch of the day is meaningfully drier. */
  driest: string | null;
  warning: { level: string; detail: string; source: string } | null;
  hours: HourSlot[];
  week: DaySlot[];
  dressed: { advice: string; why: string; carry: string[] };
  /** ISO timestamp of the reading, so the caller can say how fresh it is. */
  observedAt: string;
}

export interface Place {
  latitude: number;
  longitude: number;
  place: string;
}

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const CACHE_MS = 10 * 60 * 1000;
/** Bounded so a search-driven screen cannot grow the cache without limit. */
const CACHE_MAX = 24;

const cache = new Map<string, { at: number; value: Forecast }>();

function cacheKey(p: Place): string {
  return `${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
}

function remember(key: string, value: Forecast): void {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const UV_WORDS: { from: number; word: string }[] = [
  { from: 11, word: "Extreme" },
  { from: 8, word: "Very high" },
  { from: 6, word: "High" },
  { from: 3, word: "Moderate" },
  { from: 0, word: "Low" },
];

function uvWord(index: number): string {
  return UV_WORDS.find((u) => index >= u.from)?.word ?? "Low";
}

/** "2026-09-21T18:04" -> "18:04". Open-Meteo returns local time already. */
function clockOf(iso: string | undefined): string {
  if (!iso) return "";
  const t = iso.split("T")[1] ?? "";
  return t.slice(0, 5);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface OpenMeteoResponse {
  current?: Record<string, number | string | undefined>;
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: (number | null)[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: (number | null)[];
    sunset?: string[];
    uv_index_max?: (number | null)[];
    wind_speed_10m_max?: number[];
    wind_gusts_10m_max?: number[];
  };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export async function getForecast(where: Place): Promise<Forecast | null> {
  const key = cacheKey(where);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const url =
    `${ENDPOINT}?latitude=${where.latitude}&longitude=${where.longitude}` +
    `&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,wind_gusts_10m` +
    `&hourly=temperature_2m,precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset,uv_index_max,wind_speed_10m_max,wind_gusts_10m_max` +
    `&timezone=auto&forecast_days=7`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), next: { revalidate: 600 } });
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
    const json = (await res.json()) as OpenMeteoResponse;

    const current = json.current;
    if (!current || typeof current.temperature_2m !== "number") {
      throw new Error("Open-Meteo returned no current conditions");
    }

    const airC = num(current.temperature_2m);
    const apparentC = num(current.apparent_temperature, airC);
    const look = describeWeather(num(current.weather_code, -1));
    const gust = num(current.wind_gusts_10m, num(current.wind_speed_10m));

    // Hours from the current one forward, capped at what the row can show.
    const hours = sliceHours(json.hourly, current.time as string | undefined);
    const week = sliceWeek(json.daily);

    const uvIndex = num(json.daily?.uv_index_max?.[0], 0);
    const rainChance = num(json.daily?.precipitation_probability_max?.[0], 0);
    const high = roundTemp(num(json.daily?.temperature_2m_max?.[0], airC));
    const low = roundTemp(num(json.daily?.temperature_2m_min?.[0], airC));

    const advisory = deriveAdvisory({ gustKmh: gust, rainChance, uvIndex, maxC: high, minC: low });
    const gap = Math.round(airC) - Math.round(apparentC);

    const value: Forecast = {
      place: where.place,
      context: `${where.place} · updated ${clockOf(current.time as string | undefined) || "just now"}`,
      temp: roundTemp(airC),
      feelsLike: roundTemp(apparentC),
      condition: look.label,
      icon: look.icon,
      feelsNote:
        Math.abs(gap) >= 3
          ? gap > 0
            ? "the wind is doing that"
            : "humidity is doing that"
          : null,
      high,
      low,
      wind: `${Math.round(num(current.wind_speed_10m))} km/h`,
      uv: `${Math.round(uvIndex)} · ${uvWord(uvIndex)}`,
      sunset: clockOf(json.daily?.sunset?.[0]),
      driest: driestWindow(hours.map((h) => ({ at: h.at, rain: h.rain }))),
      warning: advisory
        ? { ...advisory, source: "Derived from the forecast — not an official warning" }
        : null,
      hours,
      week,
      dressed: dressFor({ apparentC, airC, rainChance, gustKmh: gust, uvIndex }),
      observedAt: (current.time as string | undefined) ?? new Date().toISOString(),
    };

    remember(key, value);
    return value;
  } catch (e) {
    // Weather is one card on a screen that has to keep working. Warn, and hand
    // back the last good reading rather than an invented one.
    reportWarning(e, { code: "weather.fetch", route: "getForecast" });
    return hit?.value ?? null;
  }
}

function sliceHours(hourly: OpenMeteoResponse["hourly"], currentTime: string | undefined): HourSlot[] {
  const times = hourly?.time ?? [];
  const temps = hourly?.temperature_2m ?? [];
  const rain = hourly?.precipitation_probability ?? [];
  if (times.length === 0) return [];

  // Open-Meteo's `current.time` is the current hour in the same local clock.
  const startHour = (currentTime ?? "").slice(0, 13);
  const from = Math.max(0, times.findIndex((t) => t.slice(0, 13) === startHour));

  return times.slice(from, from + 11).map((t, i) => ({
    at: t.slice(11, 13),
    temp: roundTemp(num(temps[from + i], 0)),
    rain: Math.round(num(rain[from + i], 0)),
  }));
}

function sliceWeek(daily: OpenMeteoResponse["daily"]): DaySlot[] {
  const days = daily?.time ?? [];
  return days.slice(0, 7).map((iso, i) => ({
    day: i === 0 ? "Today" : WEEKDAYS[new Date(`${iso}T00:00:00`).getDay()],
    icon: describeWeather(num(daily?.weather_code?.[i], -1)).icon,
    high: roundTemp(num(daily?.temperature_2m_max?.[i], 0)),
    low: roundTemp(num(daily?.temperature_2m_min?.[i], 0)),
    rain: Math.round(num(daily?.precipitation_probability_max?.[i], 0)),
  }));
}
