import { describe, expect, it } from "vitest";
import { distanceKm, placeScore } from "@/lib/weather/geocode";

const SYDNEY = { latitude: -33.8688, longitude: 151.2093 };
const BRISBANE_QLD = { latitude: -27.4679, longitude: 153.0281 };
const BRISBANE_CA = { latitude: 37.6808, longitude: -122.4 };

describe("distanceKm", () => {
  it("is zero for the same point", () => {
    expect(distanceKm(SYDNEY, SYDNEY)).toBeCloseTo(0, 6);
  });

  it("matches the known Sydney–Brisbane great-circle distance", () => {
    // ~732 km; allow a few km for the spherical-earth approximation.
    expect(distanceKm(SYDNEY, BRISBANE_QLD)).toBeGreaterThan(725);
    expect(distanceKm(SYDNEY, BRISBANE_QLD)).toBeLessThan(740);
  });

  it("puts the Australian Brisbane far closer to Sydney than the Californian one", () => {
    expect(distanceKm(SYDNEY, BRISBANE_QLD)).toBeLessThan(distanceKm(SYDNEY, BRISBANE_CA));
  });

  it("is symmetric", () => {
    expect(distanceKm(SYDNEY, BRISBANE_QLD)).toBeCloseTo(distanceKm(BRISBANE_QLD, SYDNEY), 6);
  });

  it("handles antipodes without NaN from floating-point drift", () => {
    const d = distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 });
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(20015, 0);
  });
});

describe("placeScore", () => {
  const SYDNEY_TO = {
    brisbaneQld: { distanceKm: 733, population: 2780063 },
    brisbaneCbd: { distanceKm: 732, population: 9460 },
    brisbaneCa: { distanceKm: 11944, population: 4717 },
    brisbaneGrove: { distanceKm: 171, population: 116 },
    brisbanePark: { distanceKm: 84, population: 0 },
  };

  const rank = (places: Record<string, { distanceKm: number; population: number }>) =>
    Object.entries(places)
      .sort(([, a], [, b]) => placeScore(b) - placeScore(a))
      .map(([name]) => name);

  it("puts the city everyone means first, over nearer hamlets", () => {
    expect(rank(SYDNEY_TO)[0]).toBe("brisbaneQld");
  });

  it("puts the Australian Brisbane above the Californian one", () => {
    expect(placeScore(SYDNEY_TO.brisbaneQld)).toBeGreaterThan(placeScore(SYDNEY_TO.brisbaneCa));
  });

  it("ranks a place with no population below anywhere people live", () => {
    expect(placeScore(SYDNEY_TO.brisbanePark)).toBeLessThan(placeScore(SYDNEY_TO.brisbaneGrove));
  });

  it("separates two comparable places by which is closer", () => {
    const near = { distanceKm: 100, population: 50000 };
    const far = { distanceKm: 10000, population: 50000 };
    expect(placeScore(near)).toBeGreaterThan(placeScore(far));
  });

  it("prefers a city to a village that is closer but far smaller", () => {
    const city = { distanceKm: 700, population: 2000000 };
    const village = { distanceKm: 20, population: 300 };
    expect(placeScore(city)).toBeGreaterThan(placeScore(village));
  });

  it("stays finite at zero distance and zero population", () => {
    expect(Number.isFinite(placeScore({ distanceKm: 0, population: 0 }))).toBe(true);
  });
});
