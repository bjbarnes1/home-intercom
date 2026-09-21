/**
 * WMO weather interpretation codes (Open-Meteo's `weather_code`) mapped to a
 * short human label and one of the Hub's drawn icons.
 *
 * Pure, so it can be unit-tested without touching the network.
 */

/** The subset of Hub icon names this module is allowed to return. */
export type WeatherIcon = "sun" | "cloud" | "rain" | "wind" | "snow" | "storm" | "weather";

export interface WeatherLook {
  /** Short label, e.g. "Light rain". */
  label: string;
  icon: WeatherIcon;
}

/** Ranges are inclusive; first match wins. Codes outside any range are unknown. */
const TABLE: { from: number; to: number; label: string; icon: WeatherIcon }[] = [
  { from: 0, to: 0, label: "Clear", icon: "sun" },
  { from: 1, to: 1, label: "Mostly clear", icon: "sun" },
  { from: 2, to: 2, label: "Partly cloudy", icon: "cloud" },
  { from: 3, to: 3, label: "Overcast", icon: "cloud" },
  { from: 45, to: 48, label: "Fog", icon: "cloud" },
  { from: 51, to: 55, label: "Drizzle", icon: "rain" },
  { from: 56, to: 57, label: "Freezing drizzle", icon: "snow" },
  { from: 61, to: 61, label: "Light rain", icon: "rain" },
  { from: 62, to: 63, label: "Rain", icon: "rain" },
  { from: 65, to: 65, label: "Heavy rain", icon: "rain" },
  { from: 66, to: 67, label: "Freezing rain", icon: "snow" },
  { from: 71, to: 75, label: "Snow", icon: "snow" },
  { from: 77, to: 77, label: "Snow grains", icon: "snow" },
  { from: 80, to: 81, label: "Showers", icon: "rain" },
  { from: 82, to: 82, label: "Heavy showers", icon: "rain" },
  { from: 85, to: 86, label: "Snow showers", icon: "snow" },
  { from: 95, to: 95, label: "Thunderstorm", icon: "storm" },
  { from: 96, to: 99, label: "Storm with hail", icon: "storm" },
];

/** Describe a WMO code. Unknown codes degrade to a neutral label and icon. */
export function describeWeather(code: number): WeatherLook {
  const row = TABLE.find((r) => code >= r.from && code <= r.to);
  return row ? { label: row.label, icon: row.icon } : { label: "Weather", icon: "weather" };
}

/** Whole degrees for display; keeps -0 from showing up. */
export function roundTemp(celsius: number): number {
  const rounded = Math.round(celsius);
  return rounded === 0 ? 0 : rounded;
}
