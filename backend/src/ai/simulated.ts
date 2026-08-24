import type { CaseContext } from "./context.js";
import type { AgentDecisionOutput } from "./schema.js";
import { clampConfidence } from "../lib/money.js";

/**
 * Deterministic rule-based reasoning engine used whenever no live AI
 * provider is configured (see aiLiveConfigured in lib/env.ts). It satisfies
 * the exact same structured contract as the Claude-backed provider so the
 * rest of the pipeline (policy engine, strategy executor, UI) cannot tell
 * the difference — only the audit trail's `provider` field does, and the
 * UI always labels this "Simulated AI" so results are never misrepresented
 * as live model output.
 *
 * This is not a stub: it encodes real domain heuristics (issuer-decline
 * recency, customer value, retry exhaustion, overdue ageing) so demo runs
 * produce coherent, explainable decisions without any external API call.
 */
export function runSimulatedAgent(ctx: CaseContext): AgentDecisionOutput {
  if (ctx.customerOptedOut) {
    return stopDecision(ctx, "customer_inactivity", ["customer has opted out of contact"], "Customer opted out of recovery contact; no further outreach permitted.");
  }

  if (ctx.isSuspicious) {
    return stopDecision(ctx, "suspicious_transaction", ["transaction flagged as suspicious/restricted"], "Transaction carries a suspicious/restricted flag; recovery contact is blocked pending manual compliance review.");
  }

  if (ctx.sourceType === "RECEIVABLE_OVERDUE") {
    return receivableDecision(ctx);
  }

  if (ctx.sourceType === "CHECKOUT_ABANDONED") {
    return abandonmentDecision(ctx);
  }

  // FAILED_PAYMENT / SUBSCRIPTION_DEGRADED
  return failedPaymentDecision(ctx);
}

function failedPaymentDecision(ctx: CaseContext): AgentDecisionOutput {
  const signals: string[] = [];
  let rootCause = ctx.heuristicRootCauseHint;
  let confidence = 0.6;

  if (ctx.priorFailedAttempts >= 3) {
    rootCause = "repeated_failed_retries";
    confidence = 0.88;
    signals.push(`${ctx.priorFailedAttempts} prior failed attempts on this payment`);
  } else if (ctx.errorCode?.toUpperCase().includes("INSUFFICIENT") || ctx.errorDescription?.toLowerCase().includes("insufficient")) {
    rootCause = "insufficient_funds";
    confidence = 0.82;
    signals.push("issuer error indicates insufficient funds");
  } else if (ctx.errorStep === "payment_authentication" || ctx.errorDescription?.toLowerCase().includes("otp") || ctx.errorDescription?.toLowerCase().includes("3ds")) {
    rootCause = "authentication_failure";
    confidence = 0.79;
    signals.push("failure occurred at the authentication step (OTP/3DS)");
  } else if (ctx.errorDescription?.toLowerCase().includes("expired")) {
    rootCause = "expired_card";
    confidence = 0.9;
    signals.push("card expiry detected in error description");
  } else if (ctx.recentFailureSpikeAcrossMerchant) {
    rootCause = "network_degradation";
    confidence = 0.74;
    signals.push("elevated failure rate across merchant in the same window");
  } else if (ctx.hadRecentSuccessfulPayment && ctx.hoursSinceFailure < 24) {
    rootCause = "temporary_issuer_failure";
    confidence = 0.84;
    signals.push("customer had a recent successful payment", "failure is recent and isolated");
  } else {
    rootCause = "bank_decline";
    confidence = 0.65;
    signals.push("generic issuer/bank decline with no strong secondary signal");
  }

  if (ctx.errorSource) signals.push(`error source: ${ctx.errorSource}`);
  if (ctx.paymentMethod) signals.push(`payment method: ${ctx.paymentMethod}`);

  const highValue = ctx.customerSegment === "VIP" || ctx.customerSegment === "HIGH_VALUE" || ctx.amountAtRiskPaise >= 5_000_000;

  if (ctx.priorFailedAttempts >= 2) {
    return highValue
      ? decision(ctx, rootCause, confidence, signals, "ESCALATION",
          "Two or more retries already failed for a high-value customer; hand off to a human recovery specialist rather than continuing automated retries.",
          0.45, { maxAttempts: 0, cooldownHours: 0 },
          ["customer requests stop", "case marked resolved by merchant"],
          "high-value customer with 2+ failures escalates automatically")
      : stopDecision(ctx, rootCause, signals, "Retry budget exhausted for a standard-value case; further automated retries are not permitted by policy.");
  }

  if (rootCause === "expired_card" || rootCause === "authentication_failure") {
    return decision(ctx, rootCause, confidence, signals, "ALT_METHOD",
      "Retrying the same method will fail again; prompt the customer to use a different payment method or update card details.",
      0.55, { maxAttempts: 2, cooldownHours: 2 },
      ["customer completes payment", `${2} outreach attempts exhausted`],
      "no financial action beyond a payment link is auto-executed");
  }

  if (rootCause === "temporary_issuer_failure" || rootCause === "network_degradation") {
    return decision(ctx, rootCause, confidence, signals, "DELAYED_RETRY",
      "Failure looks transient (issuer/network); a cooldown retry has a high chance of success without bothering the customer.",
      0.72, { maxAttempts: 2, cooldownHours: 6 },
      ["retry succeeds", "2 delayed retries exhausted"],
      "auto-retry only, within policy retry cap");
  }

  if (rootCause === "insufficient_funds") {
    return decision(ctx, rootCause, confidence, signals, "REMINDER",
      "Immediate retry is unlikely to succeed against insufficient funds; a gentle reminder after a longer cooldown performs better.",
      0.4, { maxAttempts: 1, cooldownHours: 48 },
      ["customer completes payment", "reminder window (7 days) elapses"],
      "reminder only, no repeated debit attempts against low balance");
  }

  return decision(ctx, rootCause, confidence, signals, "SMART_RETRY",
    "No strong negative signal found; an immediate smart retry is the lowest-friction first step.",
    0.6, { maxAttempts: 1, cooldownHours: 1 },
    ["retry succeeds", "1 retry exhausted"],
    "single bounded retry before re-evaluation");
}

function abandonmentDecision(ctx: CaseContext): AgentDecisionOutput {
  const signals = [`checkout abandoned ${Math.round(ctx.hoursSinceFailure)}h ago`];
  const highValue = ctx.customerSegment === "VIP" || ctx.customerSegment === "HIGH_VALUE";
  if (highValue) signals.push(`customer segment: ${ctx.customerSegment}`);

  const strategy = ctx.hoursSinceFailure < 2 ? "REMINDER" : "PAYMENT_LINK";
  const prob = ctx.hoursSinceFailure < 2 ? 0.5 : highValue ? 0.42 : 0.3;

  return decision(ctx, "checkout_abandonment", 0.7, signals, strategy,
    strategy === "REMINDER"
      ? "Very recent abandonment; a same-session reminder recovers most drop-offs without extra friction."
      : "Abandonment is no longer fresh; issue a fresh payment link so the customer can resume on their own time.",
    prob, { maxAttempts: 2, cooldownHours: 12 },
    ["customer completes payment", "2 reminders sent with no response"],
    "no payment credentials are stored or reused; customer completes payment on Razorpay-hosted page");
}

function receivableDecision(ctx: CaseContext): AgentDecisionOutput {
  const overdue = ctx.daysOverdue ?? 0;
  const signals = [`${overdue} days overdue`];
  const highValue = ctx.amountAtRiskPaise >= 5_000_000;
  if (highValue) signals.push("high-value receivable");

  if (overdue > 45 || highValue) {
    signals.push(overdue > 45 ? "significantly overdue (>45 days)" : "amount exceeds auto-follow-up threshold");
    return decision(ctx, "invoice_overdue", 0.8, signals, "ESCALATION",
      "Receivable is either long overdue or high value; route to a human account manager for a structured chaser conversation.",
      0.35, { maxAttempts: 0, cooldownHours: 0 },
      ["invoice paid", "written off by finance"],
      "no automated payment attempt against a B2B receivable without merchant approval");
  }

  return decision(ctx, "invoice_overdue", 0.75, signals, "RECEIVABLE_FOLLOWUP",
    "Receivable is moderately overdue; a structured reminder-then-escalation chaser sequence is appropriate before human escalation.",
    0.55, { maxAttempts: 3, cooldownHours: 72 },
    ["invoice paid", "3 follow-ups exhausted", "promise-to-pay date missed"],
    "chaser sequence only; no automatic charge against receivable");
}

function decision(
  ctx: CaseContext,
  rootCause: AgentDecisionOutput["rootCause"],
  confidence: number,
  signals: string[],
  strategyCode: AgentDecisionOutput["recommendedStrategyCode"],
  reason: string,
  probability: number,
  bounds: { maxAttempts: number; cooldownHours: number },
  stoppingConditions: string[],
  complianceNotes: string,
): AgentDecisionOutput {
  return {
    rootCause,
    confidence: clampConfidence(confidence),
    signals: signals.slice(0, 8),
    recommendedStrategyCode: strategyCode,
    recommendedReason: reason,
    expectedRecoveryProbability: clampConfidence(probability),
    expectedRecoveredAmountPaise: Math.round(ctx.amountAtRiskPaise * clampConfidence(probability)),
    maxAttempts: bounds.maxAttempts,
    cooldownHours: bounds.cooldownHours,
    stoppingConditions,
    escalationCondition: strategyCode === "ESCALATION"
      ? "already escalated"
      : "attempts exhausted without recovery, or customer requests stop",
    complianceNotes,
  };
}

function stopDecision(
  ctx: CaseContext,
  rootCause: AgentDecisionOutput["rootCause"],
  signals: string[],
  reason: string,
): AgentDecisionOutput {
  return {
    rootCause,
    confidence: 0.95,
    signals: signals.length ? signals : ["policy stop condition met"],
    recommendedStrategyCode: "STOP",
    recommendedReason: reason,
    expectedRecoveryProbability: 0,
    expectedRecoveredAmountPaise: 0,
    maxAttempts: 0,
    cooldownHours: 0,
    stoppingConditions: ["n/a - already stopped"],
    escalationCondition: "n/a",
    complianceNotes: "no further contact permitted",
  };
}
