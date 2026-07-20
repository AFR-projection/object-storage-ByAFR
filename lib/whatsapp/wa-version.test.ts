import { describe, it, expect } from "vitest";
import { parseWaVersionString, FALLBACK_WA_VERSION } from "@/lib/whatsapp/wa-version";

describe("parseWaVersionString", () => {
  it("parses comma-separated versions", () => {
    expect(parseWaVersionString("2,3000,123")).toEqual([2, 3000, 123]);
  });

  it("parses dot-separated versions", () => {
    expect(parseWaVersionString("2.3000.123")).toEqual([2, 3000, 123]);
  });

  it("trims whitespace around parts", () => {
    expect(parseWaVersionString(" 2 , 3000 , 123 ")).toEqual([2, 3000, 123]);
  });

  it("returns null for empty / missing input", () => {
    expect(parseWaVersionString("")).toBeNull();
    expect(parseWaVersionString(undefined)).toBeNull();
    expect(parseWaVersionString(null)).toBeNull();
    expect(parseWaVersionString("   ")).toBeNull();
  });

  it("returns null for malformed versions", () => {
    expect(parseWaVersionString("2.3000")).toBeNull(); // too few
    expect(parseWaVersionString("2.3000.123.4")).toBeNull(); // too many
    expect(parseWaVersionString("abc")).toBeNull();
    expect(parseWaVersionString("2.x.3")).toBeNull();
    expect(parseWaVersionString("-1.2.3")).toBeNull(); // negative
  });

  it("exposes a sane pinned fallback (3 non-negative ints)", () => {
    expect(FALLBACK_WA_VERSION).toHaveLength(3);
    for (const n of FALLBACK_WA_VERSION) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });
});
