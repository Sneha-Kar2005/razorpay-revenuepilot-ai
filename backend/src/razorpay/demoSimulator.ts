import { makeRng } from "../lib/rng.js";
import type { StrategyCode } from "../lib/constants.js";

export interface SimulatedExecutionResult {
  kind: "SUCCESS" | "FAILURE" | "API_ERROR";
  recoveredAmountPaise: number;
  message: string;
  apiErrorCode?: string;
}

const BASE_SUCCESS_RATE: Record<StrategyCode, number> = {
  SMART_RETRY: 0.42,
  DELAYED_RETRY: 0.55,
  PAYMENT_LINK: 0.38,
  REMINDER: 0.27,
  ALT_METHOD: 0.5,
  ESCALATION: 0.6,
  RECEIVABLE_FOLLOWUP: 0.45,
  STOP: 0,
};

/**
 * Deterministic (seeded) simulation of what would happen when a recovery
 * channel is actually invoked. Used only when Razorpay TEST credentials are
 * not configured. A small, fixed slice of executions deterministically
 * simulate a transient API error (rather than a normal customer decline) so
 * the bounded-retry / failure-handling path (see docs/architecture.md
 * "Failure handling") is always exercised in the demo batch, not hidden.
 */
export function simulateChannelExecution(params: {
  caseId: string;
  attemptNumber: number;
  strategyCode: StrategyCode;
  amountAtRiskPaise: number;
  expectedRecoveryProbability: number;
}): SimulatedExecutionResult {
  const rng = makeRng(`${params.caseId}:${params.attemptNumber}:${params.strategyCode}`);
  const roll = rng();

  // ~6% of executions simulate an upstream API failure (gateway timeout /
  // 5xx) independent of customer behaviour - this is the injected failure
  // scenario used to demonstrate graceful failure handling end-to-end.
  if (roll < 0.06) {
    return {
      kind: "API_ERROR",
      recoveredAmountPaise: 0,
      message: "Simulated upstream error: Razorpay API request timed out (GATEWAY_TIMEOUT)",
      apiErrorCode: "SIMULATED_GATEWAY_TIMEOUT",
    };
  }

  const successRate = (BASE_SUCCESS_RATE[params.strategyCode] + params.expectedRecoveryProbability) / 2;
  const success = rng() < successRate;

  if (!success) {
    return { kind: "FAILURE", recoveredAmountPaise: 0, message: "Customer did not complete payment via this channel" };
  }

  // Occasionally a partial recovery (customer pays a partial/settled amount) for link-based channels
  const partial = params.strategyCode === "PAYMENT_LINK" && rng() < 0.08;
  const recoveredAmountPaise = partial ? Math.round(params.amountAtRiskPaise * (0.4 + rng() * 0.4)) : params.amountAtRiskPaise;

  return {
    kind: "SUCCESS",
    recoveredAmountPaise,
    message: partial ? "Customer completed a partial payment via link" : "Customer completed payment successfully",
  };
}
