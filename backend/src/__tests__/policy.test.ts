import { describe, it, expect } from "vitest";
import { evaluatePolicy } from "../policy/engine.js";
import type { CaseContext } from "../ai/context.js";
import type { AgentDecisionOutput } from "../ai/schema.js";

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

function decision(overrides: Partial<AgentDecisionOutput> = {}): AgentDecisionOutput {
  return {
    rootCause: "bank_decline",
    confidence: 0.7,
    signals: ["generic decline"],
    recommendedStrategyCode: "SMART_RETRY",
    recommendedReason: "test",
    expectedRecoveryProbability: 0.5,
    expectedRecoveredAmountPaise: 25000,
    maxAttempts: 1,
    cooldownHours: 1,
    stoppingConditions: ["retry succeeds"],
    escalationCondition: "n/a",
    complianceNotes: "n/a",
    ...overrides,
  };
}

describe("policy engine", () => {
  it("allows a plain, low-value, first-attempt case with no exceptions", () => {
    const result = evaluatePolicy(ctx(), decision());
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it("blocks any case where the customer has opted out, regardless of AI recommendation", () => {
    const result = evaluatePolicy(ctx({ customerOptedOut: true }), decision());
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain("customer_opted_out_of_contact");
  });

  it("blocks suspicious transactions even if the AI recommends a retry", () => {
    const result = evaluatePolicy(ctx({ isSuspicious: true }), decision({ recommendedStrategyCode: "SMART_RETRY" }));
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes.some((r) => r.includes("suspicious"))).toBe(true);
  });

  it("blocks when the AI itself recommends STOP", () => {
    const result = evaluatePolicy(ctx(), decision({ recommendedStrategyCode: "STOP" }));
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes).toContain("agent_recommended_stop");
  });

  it("caps AI-requested max attempts to the configured policy ceiling (never trusts the AI's number blindly)", () => {
    const result = evaluatePolicy(ctx(), decision({ maxAttempts: 5 }));
    expect(result.boundedMaxAttempts).toBeLessThanOrEqual(2); // POLICY_MAX_RETRIES default = 2
  });

  it("raises a too-short AI-requested cooldown to the configured minimum", () => {
    const result = evaluatePolicy(ctx(), decision({ cooldownHours: 0 }));
    expect(result.boundedCooldownHours).toBeGreaterThanOrEqual(4); // POLICY_MIN_COOLDOWN_HOURS default = 4
  });

  it("blocks once the retry budget is already exhausted, unless the strategy is escalation/receivable follow-up", () => {
    const result = evaluatePolicy(ctx({ priorFailedAttempts: 2 }), decision({ recommendedStrategyCode: "SMART_RETRY" }));
    expect(result.allowed).toBe(false);
    expect(result.reasonCodes.some((r) => r.startsWith("retry_budget_exhausted"))).toBe(true);
  });

  it("does not block exhausted retries when the AI recommends escalation instead", () => {
    const result = evaluatePolicy(ctx({ priorFailedAttempts: 2 }), decision({ recommendedStrategyCode: "ESCALATION" }));
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("requires human approval above the amount-at-risk threshold, even when otherwise allowed", () => {
    const result = evaluatePolicy(ctx({ amountAtRiskPaise: 6_000_000 }), decision());
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it("requires human approval when expected recovered amount exceeds the auto-recovery cap", () => {
    const result = evaluatePolicy(ctx(), decision({ expectedRecoveredAmountPaise: 6_000_000 }));
    expect(result.requiresApproval).toBe(true);
  });

  it("always requires approval for an escalation strategy", () => {
    const result = evaluatePolicy(ctx(), decision({ recommendedStrategyCode: "ESCALATION" }));
    expect(result.requiresApproval).toBe(true);
  });
});
