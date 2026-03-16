import { describe, expect, it } from "vitest";

import { formatEventStart, formatPol, parsePolInput, remainingSupply } from "./format";

describe("format utilities", () => {
  it("formats POL values with trimmed precision", () => {
    expect(formatPol(1234560000000000000n, 4)).toBe("1.2345");
    expect(formatPol(1000000000000000000n, 4)).toBe("1");
  });

  it("parses valid POL input and rejects invalid strings", () => {
    const valid = parsePolInput("0.25");
    expect(valid).toEqual({ ok: true, value: 250000000000000000n });

    const invalid = parsePolInput("abc");
    expect(invalid).toEqual({ ok: false, error: "Invalid POL amount." });
  });

  it("computes non-negative remaining supply", () => {
    expect(remainingSupply(100n, 25n)).toBe(75n);
    expect(remainingSupply(10n, 30n)).toBe(0n);
  });

  it("formats event start timestamps with a readable fallback", () => {
    expect(formatEventStart(null)).toBe("Date to be announced");
    expect(formatEventStart(Date.parse("2026-06-01T18:30:00Z"))).toContain("2026");
  });
});
