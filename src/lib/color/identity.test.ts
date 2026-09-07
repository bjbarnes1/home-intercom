import { describe, expect, it } from "vitest";
import { ident, litIdent, resolveIdentity, resolveTheme } from "@/lib/color/identity";

describe("identity colour map", () => {
  it("resolves aliases onto identity keys", () => {
    expect(resolveIdentity("Gus's room")).toBe("Gus");
    expect(resolveIdentity("soph")).toBe("Mum");
    expect(resolveIdentity("BJ")).toBe("Dad");
  });

  it("returns CSS tokens, not literal oklch", () => {
    expect(ident("Gus")).toBe("var(--hi-ident-gus)");
    expect(litIdent("Kitchen")).toBe("var(--hi-lit-kitchen)");
    expect(ident("unknown")).toBe("var(--color-accent)");
  });

  it("resolveTheme respects pref and lux dead band", () => {
    expect(resolveTheme("light", 0)).toBe("light");
    expect(resolveTheme("dark", 999)).toBe("dark");
    expect(resolveTheme("auto", 130, "dark")).toBe("light");
    expect(resolveTheme("auto", 40, "light")).toBe("dark");
    expect(resolveTheme("auto", 90, "dark")).toBe("dark");
    expect(resolveTheme("auto", 90, "light")).toBe("light");
  });
});
