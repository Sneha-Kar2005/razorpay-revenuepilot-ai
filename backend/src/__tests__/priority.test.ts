import { describe, it, expect } from "vitest";
import { computePriorityScore } from "../risk/priority.js";

describe("risk priority scoring", () => {
  it("gives a higher score to a larger amount at risk, all else equal", () => {
    const low = computePriorityScore({ amountAtRiskPaise: 29900, customerSegment: "STANDARD", sourceType: "FAILED_PAYMENT", hoursSinceEvent: 10 });
    const high = computePriorityScore({ amountAtRiskPaise: 7_500_000, customerSegment: "STANDARD", sourceType: "FAILED_PAYMENT", hoursSinceEvent: 10 });
    expect(high).toBeGreaterThan(low);
  });

  it("gives a higher score to a VIP customer than a NEW customer for the same case", () => {
    const vip = computePriorityScore({ amountAtRiskPaise: 499900, customerSegment: "VIP", sourceType: "FAILED_PAYMENT", hoursSinceEvent: 10 });
    const neu = computePriorityScore({ amountAtRiskPaise: 499900, customerSegment: "NEW", sourceType: "FAILED_PAYMENT", hoursSinceEvent: 10 });
    expect(vip).toBeGreaterThan(neu);
  });

  it("decays priority for very stale cases compared to a fresh case of the same value", () => {
    const fresh = computePriorityScore({ amountAtRiskPaise: 499900, customerSegment: "STANDARD", sourceType: "FAILED_PAYMENT", hoursSinceEvent: 12 });
    const stale = computePriorityScore({ amountAtRiskPaise: 499900, customerSegment: "STANDARD", sourceType: "FAILED_PAYMENT", hoursSinceEvent: 700 });
    expect(stale).toBeLessThan(fresh);
  });

  it("always returns a score within [0, 100]", () => {
    const score = computePriorityScore({ amountAtRiskPaise: 150_000_000, customerSegment: "VIP", sourceType: "FAILED_PAYMENT", hoursSinceEvent: 1 });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
