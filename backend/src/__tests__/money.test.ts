import { describe, it, expect } from "vitest";
import { rupeesToPaise, paiseToRupees, formatINR, percentOfPaise, sumPaise, ratio, clampConfidence } from "../lib/money.js";

describe("money", () => {
  it("converts rupees to paise as integers", () => {
    expect(rupeesToPaise(499)).toBe(49900);
    expect(rupeesToPaise(299.5)).toBe(29950);
  });

  it("converts paise back to rupees", () => {
    expect(paiseToRupees(49900)).toBe(499);
  });

  it("formats paise as INR currency string", () => {
    expect(formatINR(49900)).toContain("499");
    expect(formatINR(49900)).toContain("₹");
  });

  it("computes an integer percentage of a paise amount without floating point drift", () => {
    expect(percentOfPaise(100000, 2)).toBe(2000);
    expect(percentOfPaise(333, 2)).toBe(7); // 6.66 rounds to 7, stays an integer
  });

  it("sums a list of paise amounts exactly", () => {
    expect(sumPaise([100, 200, 300])).toBe(600);
    expect(sumPaise([])).toBe(0);
  });

  it("computes a safe ratio, returning 0 for a zero denominator instead of NaN", () => {
    expect(ratio(50, 100)).toBe(0.5);
    expect(ratio(10, 0)).toBe(0);
  });

  it("clamps confidence into [0,1]", () => {
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(-0.2)).toBe(0);
    expect(clampConfidence(0.42)).toBe(0.42);
  });
});
