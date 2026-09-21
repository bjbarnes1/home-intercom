import { describe, expect, it } from "vitest";
import { greetingFor, readClock } from "./Clock";

describe("greetingFor", () => {
  it("greets the part of the day someone is actually in", () => {
    expect(greetingFor(7)).toBe("Good morning");
    expect(greetingFor(13)).toBe("Good afternoon");
    expect(greetingFor(19)).toBe("Good evening");
    expect(greetingFor(23)).toBe("Good night");
  });

  it("calls the small hours night, not morning", () => {
    // 3am on a kitchen panel is somebody getting a glass of water.
    expect(greetingFor(3)).toBe("Good night");
    expect(greetingFor(0)).toBe("Good night");
  });

  it("changes exactly on the boundaries", () => {
    expect(greetingFor(4)).toBe("Good night");
    expect(greetingFor(5)).toBe("Good morning");
    expect(greetingFor(11)).toBe("Good morning");
    expect(greetingFor(12)).toBe("Good afternoon");
    expect(greetingFor(16)).toBe("Good afternoon");
    expect(greetingFor(17)).toBe("Good evening");
    expect(greetingFor(21)).toBe("Good evening");
    expect(greetingFor(22)).toBe("Good night");
  });

  it("has something to say for every hour of the day", () => {
    for (let h = 0; h < 24; h++) expect(greetingFor(h)).not.toBe("");
  });
});

describe("readClock", () => {
  it("shows a 24-hour time, zero-padded, with no seconds", () => {
    expect(readClock(new Date(2026, 8, 21, 8, 42))).toMatchObject({ time: "08:42" });
    expect(readClock(new Date(2026, 8, 21, 16, 5))).toMatchObject({ time: "16:05" });
  });

  it("names the weekday and the date", () => {
    const { date } = readClock(new Date(2026, 8, 21, 9, 0));
    expect(date).toContain("Monday");
    expect(date).toContain("21");
  });
});
