import { describe, it, expect } from "vitest";
import { runSimulatedAgent } from "../ai/simulated.js";
import { AgentDecisionSchema } from "../ai/schema.js";
import type { CaseContext } from "../ai/context.js";

function ctx(overrides: Partial<CaseContext> = {}): CaseContext {
  return {
    caseId: "case_1",
    sourceType: "FAILED_PAYMENT",
    amountAtRiskPaise: 49900,
    currency: "INR",
    customerSegment: "STANDARD",
    customerLifetimeValuePaise: 100000,
    customerOptedOut: false,
    priorFailedAttempts: 0,
    hoursSinceFailure: 2,
    hadRecentSuccessfulPayment: false,
    recentFailureSpikeAcrossMerchant: false,
    isSuspicious: false,
    heuristicRootCauseHint: "bank_decline",
    ...overrides,
  };
}

describe("simulated AI agent", () => {
  it("always produces output that satisfies the shared structured decision schema", () => {
    const cases: CaseContext[] = [
      ctx(),
      ctx({ sourceType: "CHECKOUT_ABANDONED", hoursSinceFailure: 1 }),
      ctx({ sourceType: "RECEIVABLE_OVERDUE", daysOverdue: 60, amountAtRiskPaise: 7_500_000 }),
      ctx({ customerOptedOut: true }),
      ctx({ isSuspicious: true }),
      ctx({ priorFailedAttempts: 4, customerSegment: "VIP" }),
    ];
    for (const c of cases) {
      const decision = runSimulatedAgent(c);
      expect(() => AgentDecisionSchema.parse(decision)).not.toThrow();
    }
  });

  it("recommends STOP and forces zero further attempts when the customer has opted out", () => {
    const decision = runSimulatedAgent(ctx({ customerOptedOut: true }));
    expect(decision.recommendedStrategyCode).toBe("STOP");
    expect(decision.maxAttempts).toBe(0);
  });

  it("recommends STOP for a suspicious transaction regardless of other signals", () => {
    const decision = runSimulatedAgent(ctx({ isSuspicious: true, customerSegment: "VIP" }));
    expect(decision.recommendedStrategyCode).toBe("STOP");
    expect(decision.rootCause).toBe("suspicious_transaction");
  });

  it("escalates high-value customers after repeated failures instead of retrying forever", () => {
    const decision = runSimulatedAgent(ctx({ priorFailedAttempts: 2, customerSegment: "VIP", amountAtRiskPaise: 7_500_000 }));
    expect(decision.recommendedStrategyCode).toBe("ESCALATION");
  });

  it("stops standard-value customers after repeated failures rather than escalating every case", () => {
    const decision = runSimulatedAgent(ctx({ priorFailedAttempts: 2, customerSegment: "STANDARD", amountAtRiskPaise: 49900 }));
    expect(decision.recommendedStrategyCode).toBe("STOP");
  });

  it("never derives expectedRecoveredAmountPaise above the amount actually at risk", () => {
    const decision = runSimulatedAgent(ctx({ amountAtRiskPaise: 100000 }));
    expect(decision.expectedRecoveredAmountPaise).toBeLessThanOrEqual(100000);
  });
});
