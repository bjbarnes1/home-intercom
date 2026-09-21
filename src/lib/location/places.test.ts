import { describe, it, expect } from "vitest";
import { distanceMetres, placeContaining, type PlaceCircle } from "./places";

// Sydney Opera House / Harbour Bridge — about 900m apart.
const opera = { lat: -33.8568, lng: 151.2153 };
const bridge = { lat: -33.8523, lng: 151.2108 };

describe("distanceMetres", () => {
  it("is zero for the same point", () => {
    expect(distanceMetres(opera, opera)).toBe(0);
  });

  it("measures a known short distance", () => {
    expect(distanceMetres(opera, bridge)).toBeGreaterThan(600);
    expect(distanceMetres(opera, bridge)).toBeLessThan(800);
  });

  it("is symmetric", () => {
    expect(distanceMetres(opera, bridge)).toBeCloseTo(distanceMetres(bridge, opera), 6);
  });

  it("handles a degree of latitude", () => {
    const north = { lat: opera.lat + 1, lng: opera.lng };
    expect(distanceMetres(opera, north)).toBeGreaterThan(110_000);
    expect(distanceMetres(opera, north)).toBeLessThan(112_000);
  });
});

describe("placeContaining", () => {
  const home: PlaceCircle = { id: "home", name: "Home", ...opera, radiusM: 150 };
  const suburb: PlaceCircle = { id: "suburb", name: "Our street", ...opera, radiusM: 2_000 };
  const school: PlaceCircle = { id: "school", name: "School", ...bridge, radiusM: 150 };

  it("returns null when the fix is nowhere known", () => {
    expect(placeContaining({ lat: 0, lng: 0 }, [home, school])).toBeNull();
  });

  it("finds the place a fix sits inside", () => {
    expect(placeContaining(opera, [home, school])?.id).toBe("home");
  });

  /** "Home" inside a broader "Our street" should read as Home, not the suburb. */
  it("prefers the tightest circle when they overlap", () => {
    expect(placeContaining(opera, [suburb, home])?.id).toBe("home");
    expect(placeContaining(opera, [home, suburb])?.id).toBe("home");
  });

  it("falls back to the wider circle when outside the tight one", () => {
    const downTheRoad = { lat: opera.lat + 0.005, lng: opera.lng };
    expect(placeContaining(downTheRoad, [home, suburb])?.id).toBe("suburb");
  });

  it("treats the radius as inclusive at the boundary", () => {
    const tiny: PlaceCircle = { id: "t", name: "T", ...opera, radiusM: 0 };
    expect(placeContaining(opera, [tiny])?.id).toBe("t");
  });
});
