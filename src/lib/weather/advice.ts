/**
 * Turning a forecast into something you can act on.
 *
 * Everything here is pure and unit-tested. The clothing advice is built on
 * apparent temperature rather than air temperature, which is the case the
 * feature exists for: 18° still and 18° with a 40 km/h wind want different
 * clothes, and only apparent temperature knows the difference.
 */

export interface DressingInput {
  /** Apparent ("feels like") temperature for the part of the day being dressed for. */
  apparentC: number;
  /** Air temperature, used only to explain a gap the wind is causing. */
  airC: number;
  /** Highest chance of rain across the day, 0–100. */
  rainChance: number;
  /** Peak wind gust, km/h. */
  gustKmh: number;
  /** Peak UV index for the day. */
  uvIndex: number;
}

export interface Dressing {
  /** The headline: what to put on. */
  advice: string;
  /** Why, in a clause — the part that teaches rather than instructs. */
  why: string;
  /** Extras worth carrying. Empty when there are none. */
  carry: string[];
}

/** Lower bound of each band, inclusive — 18° is a t-shirt, not a jumper. */
const LAYERS: { from: number; advice: string }[] = [
  { from: 26, advice: "Shorts and a t-shirt" },
  { from: 22, advice: "T-shirt weather" },
  { from: 18, advice: "T-shirt, with a light layer for later" },
  { from: 14, advice: "A jumper" },
  { from: 10, advice: "A jumper and long pants" },
  { from: 5, advice: "A coat over a jumper" },
  { from: Number.NEGATIVE_INFINITY, advice: "A proper coat, hat and gloves" },
];

/** What to wear, and the one reason that explains it. */
export function dressFor(input: DressingInput): Dressing {
  const { apparentC, airC, rainChance, gustKmh, uvIndex } = input;

  const base = LAYERS.find((l) => apparentC >= l.from)?.advice ?? LAYERS[LAYERS.length - 1].advice;
  const wet = rainChance >= 50;
  const advice = wet ? `${base}, under something waterproof` : base;

  const carry: string[] = [];
  if (rainChance >= 50) carry.push("umbrella");
  else if (rainChance >= 30) carry.push("raincoat, just in case");
  if (uvIndex >= 8) carry.push("hat and sunscreen");
  if (gustKmh >= 40 && !wet) carry.push("windproof layer");

  return { advice, why: explain(input), carry };
}

/**
 * The single most useful sentence about today. A wind-driven gap between air
 * and apparent temperature wins, because it is the one people get wrong.
 */
function explain(input: DressingInput): string {
  const { apparentC, airC, rainChance, gustKmh, uvIndex } = input;
  const gap = Math.round(airC) - Math.round(apparentC);

  if (gap >= 3 && gustKmh >= 20) {
    return `the wind makes ${Math.round(airC)}° feel like ${Math.round(apparentC)}°`;
  }
  if (gap <= -3) {
    return `humidity makes ${Math.round(airC)}° feel like ${Math.round(apparentC)}°`;
  }
  if (rainChance >= 70) return `${rainChance}% chance of rain today`;
  if (rainChance >= 40) return `rain is likely at some point`;
  if (uvIndex >= 8) return `UV peaks at ${Math.round(uvIndex)} — burn weather`;
  if (gustKmh >= 40) return `gusts to ${Math.round(gustKmh)} km/h`;
  return `feels like ${Math.round(apparentC)}° out there`;
}

export interface HourPoint {
  /** Hour label as shown, e.g. "14". */
  at: string;
  rain: number;
}

/**
 * The longest stretch of the remaining day with little chance of rain, for the
 * "get it done now" line. Null when nothing qualifies — better to say nothing
 * than to point at a window that is no drier than the rest of the day.
 */
export function driestWindow(hours: HourPoint[], threshold = 25): string | null {
  if (hours.length < 2) return null;

  let best: { from: number; to: number } | null = null;
  let run: { from: number; to: number } | null = null;

  hours.forEach((h, i) => {
    if (h.rain <= threshold) {
      run = run ? { from: run.from, to: i } : { from: i, to: i };
      const length = run.to - run.from;
      if (!best || length > best.to - best.from) best = { ...run };
    } else {
      run = null;
    }
  });

  // A single dry hour in a wet day is noise, not a window.
  const found = best as { from: number; to: number } | null;
  if (!found || found.to === found.from) return null;
  return `${hours[found.from].at}:00–${hours[found.to].at}:00`;
}

export interface AdvisoryInput {
  gustKmh: number;
  rainChance: number;
  uvIndex: number;
  maxC: number;
  minC: number;
}

export interface Advisory {
  /** Severity in words. The palette has no warning colour, so this carries it. */
  level: string;
  detail: string;
}

/**
 * An advisory derived from the forecast numbers.
 *
 * This is NOT an official warning and must never be presented as one — no
 * bureau has been consulted. Callers label the source accordingly. Returns null
 * when the day is unremarkable, which is most days.
 */
export function deriveAdvisory(input: AdvisoryInput): Advisory | null {
  const { gustKmh, rainChance, uvIndex, maxC, minC } = input;

  if (gustKmh >= 60) {
    return {
      level: "Strong wind",
      detail: `Gusts to ${Math.round(gustKmh)} km/h. Bring the bins in and drop the trampoline net.`,
    };
  }
  if (rainChance >= 80) {
    return { level: "Heavy rain likely", detail: `${rainChance}% chance of rain. Everyone needs a waterproof.` };
  }
  if (maxC >= 35) {
    return { level: "Heat", detail: `Reaching ${Math.round(maxC)}°. Water bottles, and keep the little ones inside at midday.` };
  }
  if (uvIndex >= 10) {
    return { level: "Extreme UV", detail: `UV peaks at ${Math.round(uvIndex)}. Unprotected skin burns in minutes.` };
  }
  if (minC <= 0) {
    return { level: "Frost", detail: `Down to ${Math.round(minC)}° overnight. Cover anything tender.` };
  }
  if (gustKmh >= 45) {
    return { level: "Windy", detail: `Gusts to ${Math.round(gustKmh)} km/h. Secure anything loose outside.` };
  }
  return null;
}
