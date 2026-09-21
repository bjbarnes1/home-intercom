import { describe, expect, it } from "vitest";
import { deriveAdvisory, dressFor, driestWindow } from "@/lib/weather/advice";

const base = { apparentC: 18, airC: 18, rainChance: 0, gustKmh: 5, uvIndex: 3 };

describe("dressFor", () => {
  it("dresses a still 18° day in a t-shirt", () => {
    expect(dressFor(base).advice).toBe("T-shirt, with a light layer for later");
  });

  it("dresses a windy 18° day in a jumper, because it feels like 12°", () => {
    const windy = dressFor({ ...base, apparentC: 12, gustKmh: 45 });
    expect(windy.advice).toBe("A jumper and long pants");
    expect(windy.why).toBe("the wind makes 18° feel like 12°");
  });

  it("puts a waterproof over the layer when rain is likely", () => {
    expect(dressFor({ ...base, rainChance: 60 }).advice).toContain("under something waterproof");
  });

  it("suggests an umbrella only once rain is likely", () => {
    expect(dressFor({ ...base, rainChance: 35 }).carry).toEqual(["raincoat, just in case"]);
    expect(dressFor({ ...base, rainChance: 60 }).carry).toContain("umbrella");
    expect(dressFor(base).carry).toEqual([]);
  });

  it("asks for a hat and sunscreen in burn weather", () => {
    expect(dressFor({ ...base, uvIndex: 9 }).carry).toContain("hat and sunscreen");
  });

  it("does not add a windproof layer when already waterproofed", () => {
    expect(dressFor({ ...base, rainChance: 70, gustKmh: 50 }).carry).not.toContain("windproof layer");
  });

  it("covers the whole temperature range without falling through", () => {
    for (const t of [-20, -5, 0, 7, 12, 16, 20, 24, 30, 45]) {
      expect(dressFor({ ...base, apparentC: t }).advice).not.toBe("");
    }
  });
});

describe("driestWindow", () => {
  it("finds the longest dry stretch", () => {
    const hours = [
      { at: "08", rain: 55 },
      { at: "09", rain: 40 },
      { at: "10", rain: 20 },
      { at: "11", rain: 15 },
      { at: "12", rain: 10 },
      { at: "13", rain: 60 },
    ];
    expect(driestWindow(hours)).toBe("10:00–12:00");
  });

  it("ignores a single dry hour in a wet day", () => {
    const hours = [
      { at: "08", rain: 80 },
      { at: "09", rain: 10 },
      { at: "10", rain: 80 },
    ];
    expect(driestWindow(hours)).toBeNull();
  });

  it("returns null when the whole day is wet", () => {
    expect(driestWindow([{ at: "08", rain: 90 }, { at: "09", rain: 95 }])).toBeNull();
  });

  it("handles too little data", () => {
    expect(driestWindow([])).toBeNull();
    expect(driestWindow([{ at: "08", rain: 0 }])).toBeNull();
  });
});

describe("deriveAdvisory", () => {
  const calm = { gustKmh: 10, rainChance: 10, uvIndex: 3, maxC: 20, minC: 12 };

  it("says nothing about an unremarkable day", () => {
    expect(deriveAdvisory(calm)).toBeNull();
  });

  it("raises strong wind ahead of anything else", () => {
    const a = deriveAdvisory({ ...calm, gustKmh: 70, rainChance: 90 });
    expect(a?.level).toBe("Strong wind");
    expect(a?.detail).toContain("70 km/h");
  });

  it("raises heavy rain, heat, UV, frost and wind in that order", () => {
    expect(deriveAdvisory({ ...calm, rainChance: 85 })?.level).toBe("Heavy rain likely");
    expect(deriveAdvisory({ ...calm, maxC: 38 })?.level).toBe("Heat");
    expect(deriveAdvisory({ ...calm, uvIndex: 11 })?.level).toBe("Extreme UV");
    expect(deriveAdvisory({ ...calm, minC: -2 })?.level).toBe("Frost");
    expect(deriveAdvisory({ ...calm, gustKmh: 50 })?.level).toBe("Windy");
  });
});
