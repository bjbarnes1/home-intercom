import { env } from "@/lib/env";
import { getForecast } from "@/lib/weather/openMeteo";
import WeatherScreen from "./WeatherScreen";

/**
 * The first paint is server-rendered from the household's own location, so the
 * Hub never shows an empty forecast while a fetch is in flight. Switching
 * places and searching happen on the client from there.
 */
export const dynamic = "force-dynamic";

export default async function WeatherPage() {
  const home = {
    latitude: env.weather.latitude,
    longitude: env.weather.longitude,
    place: env.weather.place,
  };
  return <WeatherScreen initial={await getForecast(home)} home={home} />;
}
