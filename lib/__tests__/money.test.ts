import { describe, expect, it } from "vitest";
import { calcTotals, currencyDecimals, formatCents, toMinor } from "../money";

describe("money", () => {
  it("computes per-line half-up tax", () => {
    // 8.87% on $10.00 x2 lines: round(1000*887/10000)=89 each → 178
    const r = calcTotals(
      [
        { qty: 1, unitCents: 1000, taxable: true, taxRateBpsOverride: 887 },
        { qty: 1, unitCents: 1000, taxable: true, taxRateBpsOverride: 887 },
      ],
      0,
    );
    expect(r).toEqual({ subtotalCents: 2000, taxCents: 178, totalCents: 2178 });
  });

  it("handles zero-decimal currencies", () => {
    expect(currencyDecimals("JPY")).toBe(0);
    expect(toMinor(1500, "JPY")).toBe(1500);
    expect(formatCents(1500, "JPY", "en-US")).toContain("1,500");
  });
});
