import { env } from "../lib/env.js";
import type { AgentDecisionOutput } from "../ai/schema.js";
import type { CaseContext } from "../ai/context.js";

export interface PolicyResult {
  allowed: boolean;
  requiresApproval: boolean;
  reasonCodes: string[];
  appliedRules: string[];
  boundedMaxAttempts: number;
  boundedCooldownHours: number;
}

/**
 * The deterministic gate every AI recommendation must pass before any
 * recovery action executes. The AI can *recommend*; only this engine can
 * *authorize*. Every rule fired is recorded so the audit trail can show
 * exactly why a case was allowed, blocked, or sent for human approval.
 *
 * This is intentionally simple, explicit, testable code — no LLM call,
 * no ambiguity. See docs/architecture.md for the full policy table.
 */
export function evaluatePolicy(ctx: CaseContext, decision: AgentDecisionOutput): PolicyResult {
  const reasonCodes: string[] = [];
  const appliedRules: string[] = [];
  let allowed = true;
  let requiresApproval = false;

  appliedRules.push("POLICY_MAX_RETRIES");
  const boundedMaxAttempts = Math.min(decision.maxAttempts, env.policyMaxRetries);
  if (decision.maxAttempts > env.policyMaxRetries) {
    reasonCodes.push(`ai_requested_${decision.maxAttempts}_attempts_capped_to_${env.policyMaxRetries}`);
  }

  appliedRules.push("POLICY_MIN_COOLDOWN");
  const boundedCooldownHours = Math.max(decision.cooldownHours, env.policyMinCooldownHours);
  if (decision.cooldownHours < env.policyMinCooldownHours) {
    reasonCodes.push(`cooldown_raised_to_minimum_${env.policyMinCooldownHours}h`);
  }

  if (ctx.customerOptedOut) {
    appliedRules.push("CUSTOMER_OPT_OUT");
    allowed = false;
    reasonCodes.push("customer_opted_out_of_contact");
  }

  if (ctx.isSuspicious) {
    appliedRules.push("SUSPICIOUS_TRANSACTION_BLOCK");
    allowed = false;
    reasonCodes.push("transaction_flagged_suspicious_requires_manual_compliance_review");
  }

  if (decision.recommendedStrategyCode === "STOP") {
    appliedRules.push("AI_RECOMMENDED_STOP");
    allowed = false;
    reasonCodes.push("agent_recommended_stop");
  }

  appliedRules.push("MAX_RETRY_EXHAUSTION");
  if (ctx.priorFailedAttempts >= env.policyMaxRetries && decision.recommendedStrategyCode !== "ESCALATION" && decision.recommendedStrategyCode !== "RECEIVABLE_FOLLOWUP") {
    allowed = false;
    reasonCodes.push(`retry_budget_exhausted_${ctx.priorFailedAttempts}_of_${env.policyMaxRetries}`);
  }

  appliedRules.push("HIGH_VALUE_APPROVAL_THRESHOLD");
  if (ctx.amountAtRiskPaise >= env.policyApprovalThresholdPaise) {
    requiresApproval = true;
    reasonCodes.push(`amount_${ctx.amountAtRiskPaise}_paise_meets_or_exceeds_approval_threshold_${env.policyApprovalThresholdPaise}`);
  }

  appliedRules.push("MAX_AUTO_RECOVERY_CAP");
  if (decision.expectedRecoveredAmountPaise > env.policyMaxAutoRecoveryPaise) {
    requiresApproval = true;
    reasonCodes.push(`expected_recovery_${decision.expectedRecoveredAmountPaise}_paise_exceeds_auto_cap_${env.policyMaxAutoRecoveryPaise}`);
  }

  if (decision.recommendedStrategyCode === "ESCALATION") {
    appliedRules.push("ESCALATION_REQUIRES_APPROVAL");
    requiresApproval = true;
    reasonCodes.push("escalation_strategy_always_requires_human_review");
  }

  // Refund-type financial reversals are out of scope for this agent's
  // bounded action set entirely (not present in the strategy catalog), so
  // no rule is needed to block them here — they are structurally unreachable.
  appliedRules.push("NO_REFUND_AUTOMATION_BY_DESIGN");

  if (reasonCodes.length === 0) reasonCodes.push("no_policy_exceptions");

  return { allowed, requiresApproval, reasonCodes, appliedRules, boundedMaxAttempts, boundedCooldownHours };
}
