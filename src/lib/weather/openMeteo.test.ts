import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The forecast cache's eviction order.
 *
 * It used to evict the first key a Map had ever seen, which on a Hub is home:
 * browse 24 other places and the one forecast the panel asks for every ten
 * minutes was gone, with every refresh after that a trip to Open-Meteo.
 */

const HOME = { latitude: -33.8688, longitude: 151.2093, place: "Home" };

vi.mock("@/lib/env", () => ({
  env: { weather: { latitude: -33.8688, longitude: 151.2093, place: "Home" } },
}));
vi.mock("@/lib/errors/report", () => ({ reportWarning: vi.fn() }));

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ current: { temperature_2m: 20, time: "2026-09-23T10:00" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const away = (i: number) => ({ latitude: 10 + i, longitude: 10 + i, place: `P${i}` });

describe("the forecast cache", () => {
  it("never evicts home, however many other places are looked up", async () => {
    const { getForecast } = await import("./openMeteo");
    await getForecast(HOME);
    for (let i = 0; i < 40; i++) await getForecast(away(i));

    fetchMock.mockClear();
    await getForecast(HOME);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("evicts the least recently used place, not the first one cached", async () => {
    const { getForecast } = await import("./openMeteo");
    // Fill it: home plus 23 others is the 24-entry limit.
    await getForecast(HOME);
    for (let i = 0; i < 23; i++) await getForecast(away(i));

    // Touch the oldest, then push one new place in.
    await getForecast(away(0));
    await getForecast(away(99));

    fetchMock.mockClear();
    await getForecast(away(0));
    expect(fetchMock).not.toHaveBeenCalled();
    await getForecast(away(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
