import { describe, expect, it, vi, afterEach } from "vitest";
import { reportError, reportWarning, errorMessage } from "@/lib/errors/report";

describe("error reporting", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("errorMessage reads Error.message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });

  it("reportError logs structured JSON", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("tts denied"), {
      code: "announce.tts",
      route: "/api/announce",
      announcementId: "abc",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain("[hi:error]");
    const json = JSON.parse(line.replace(/^\[hi:error\]\s*/, ""));
    expect(json.code).toBe("announce.tts");
    expect(json.message).toBe("tts denied");
    expect(json.context.announcementId).toBe("abc");
  });

  it("reportWarning uses console.warn", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    reportWarning(new Error("missing key"), {
      code: "announce.tts.not_configured",
      route: "/api/announce",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain("[hi:warn]");
  });
});
