import { prisma } from "../db/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { buildCaseContext } from "../risk/contextBuilder.js";
import { runAgent } from "../ai/agent.js";
import { evaluatePolicy } from "../policy/engine.js";
import { simulateChannelExecution } from "../razorpay/demoSimulator.js";
import { createRecoveryPaymentLink } from "../razorpay/client.js";
import { razorpayLiveConfigured } from "../lib/env.js";
import { percentOfPaise } from "../lib/money.js";
import type { StrategyCode } from "../lib/constants.js";

const LINK_CHANNEL_STRATEGIES: StrategyCode[] = ["SMART_RETRY", "DELAYED_RETRY", "PAYMENT_LINK", "ALT_METHOD"];

function channelFor(strategy: StrategyCode): string {
  if (strategy === "SMART_RETRY" || strategy === "DELAYED_RETRY") return "razorpay_retry_link";
  if (strategy === "PAYMENT_LINK" || strategy === "ALT_METHOD") return "payment_link";
  if (strategy === "REMINDER") return "sms_email";
  if (strategy === "RECEIVABLE_FOLLOWUP") return "sms_email";
  if (strategy === "ESCALATION") return "manual";
  return "none";
}

const TERMINAL_STATUSES = new Set(["RECOVERED", "STOPPED", "ESCALATED"]);

export interface CycleResult {
  status: "SKIPPED" | "STOPPED" | "AWAITING_APPROVAL" | "IN_PROGRESS" | "RECOVERED" | "PARTIALLY_RECOVERED" | "FAILED" | "API_ERROR_RETRY_SCHEDULED" | "ESCALATED";
  reason?: string;
  caseId: string;
}

/**
 * Runs one full DETECT->DIAGNOSE->DECIDE->POLICY->ACT->VERIFY cycle for a
 * single case. Idempotent: re-invoking on a case that is already terminal,
 * cooling down, or awaiting approval is a safe no-op (see TERMINAL_STATUSES
 * / nextEligibleAt / idempotencyKey checks below) so duplicate triggers
 * (double webhook delivery, duplicate demo runs, concurrent requests) can
 * never cause a duplicate recovery action.
 */
export async function runRecoveryCycle(caseId: string, actor = "agent"): Promise<CycleResult> {
  const riskCase = await prisma.revenueRiskCase.findUniqueOrThrow({ where: { id: caseId }, include: { customer: true } });

  if (TERMINAL_STATUSES.has(riskCase.status)) {
    return { status: "SKIPPED", reason: `case already terminal (${riskCase.status})`, caseId };
  }
  if (riskCase.status === "AWAITING_APPROVAL") {
    return { status: "SKIPPED", reason: "case awaiting human approval", caseId };
  }
  if (riskCase.nextEligibleAt && riskCase.nextEligibleAt.getTime() > Date.now()) {
    return { status: "SKIPPED", reason: `case in cooldown until ${riskCase.nextEligibleAt.toISOString()}`, caseId };
  }

  const ctx = await buildCaseContext(caseId);
  const agentRun = await runAgent(ctx);
  const { decision } = agentRun;

  await prisma.agentDecision.create({
    data: {
      caseId,
      provider: agentRun.provider,
      modelId: agentRun.modelId,
      rootCause: decision.rootCause,
      confidence: decision.confidence,
      signals: JSON.stringify(decision.signals),
      recommendedStrategyCode: decision.recommendedStrategyCode,
      recommendedReason: decision.recommendedReason,
      expectedRecoveryProbability: decision.expectedRecoveryProbability,
      expectedRecoveredAmountPaise: decision.expectedRecoveredAmountPaise,
      maxAttempts: decision.maxAttempts,
      cooldownHours: decision.cooldownHours,
      stoppingConditions: JSON.stringify(decision.stoppingConditions),
      escalationCondition: decision.escalationCondition,
      complianceNotes: decision.complianceNotes,
      rawModelOutput: JSON.stringify({ ...decision, provider: agentRun.provider, degraded: agentRun.degraded, error: agentRun.error }),
    },
  });
  await writeAudit({
    caseId,
    entityType: "CASE",
    entityId: caseId,
    eventType: "AI_DIAGNOSIS",
    actor: agentRun.provider === "claude" ? "agent:claude" : "agent:simulated",
    action: `Diagnosed root cause as ${decision.rootCause} (confidence ${decision.confidence}); recommended ${decision.recommendedStrategyCode}`,
    aiRecommendation: decision,
    previousState: { status: riskCase.status },
    newState: { status: "DIAGNOSED" },
  });
  await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "DIAGNOSED", riskCategory: decision.rootCause } });

  const policy = evaluatePolicy(ctx, decision);
  await prisma.policyDecision.create({
    data: {
      caseId,
      agentDecisionId: "n/a",
      allowed: policy.allowed,
      requiresApproval: policy.requiresApproval,
      reasonCodes: JSON.stringify(policy.reasonCodes),
      appliedRules: JSON.stringify(policy.appliedRules),
    },
  });
  await writeAudit({
    caseId,
    entityType: "POLICY",
    entityId: caseId,
    eventType: "POLICY_EVALUATED",
    actor: "policy_engine",
    action: policy.allowed ? (policy.requiresApproval ? "Allowed, pending human approval" : "Allowed for automated execution") : "Blocked by policy",
    policyDecision: policy,
  });

  if (!policy.allowed) {
    await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "STOPPED" } });
    await writeAudit({
      caseId,
      entityType: "CASE",
      entityId: caseId,
      eventType: "CASE_STOPPED",
      actor: "policy_engine",
      action: `Case stopped: ${policy.reasonCodes.join(", ")}`,
      previousState: { status: riskCase.status },
      newState: { status: "STOPPED" },
    });
    return { status: "STOPPED", reason: policy.reasonCodes.join(", "), caseId };
  }

  if (policy.requiresApproval) {
    await prisma.approvalRequest.create({
      data: { caseId, reason: policy.reasonCodes.join(", ") },
    });
    await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "AWAITING_APPROVAL" } });
    await writeAudit({
      caseId,
      entityType: "APPROVAL",
      entityId: caseId,
      eventType: "APPROVAL_REQUESTED",
      actor: "policy_engine",
      action: `Human approval requested: ${policy.reasonCodes.join(", ")}`,
      previousState: { status: "DIAGNOSED" },
      newState: { status: "AWAITING_APPROVAL" },
    });
    return { status: "AWAITING_APPROVAL", reason: policy.reasonCodes.join(", "), caseId };
  }

  return executeApprovedStrategy(caseId, decision.recommendedStrategyCode, policy.boundedMaxAttempts, policy.boundedCooldownHours, decision.expectedRecoveryProbability, actor);
}

/** Called directly for auto-approved cases, and again after a human approves a held case. */
export async function executeApprovedStrategy(
  caseId: string,
  strategyCode: StrategyCode,
  boundedMaxAttempts: number,
  boundedCooldownHours: number,
  expectedRecoveryProbability: number,
  actor: string,
): Promise<CycleResult> {
  const riskCase = await prisma.revenueRiskCase.findUniqueOrThrow({ where: { id: caseId }, include: { customer: true, payment: true } });

  if (strategyCode === "STOP") {
    await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "STOPPED" } });
    return { status: "STOPPED", reason: "strategy=STOP", caseId };
  }

  const attemptNumber = riskCase.attemptsMade + 1;
  if (attemptNumber > Math.max(boundedMaxAttempts, 1) && strategyCode !== "ESCALATION" && strategyCode !== "RECEIVABLE_FOLLOWUP") {
    await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "FAILED" } });
    await writeAudit({
      caseId,
      entityType: "CASE",
      entityId: caseId,
      eventType: "RETRY_BUDGET_EXHAUSTED",
      actor: "policy_engine",
      action: `Retry budget exhausted at attempt ${attemptNumber} (max ${boundedMaxAttempts})`,
    });
    return { status: "FAILED", reason: "retry budget exhausted", caseId };
  }

  const strategyRow = await prisma.recoveryStrategy.findUniqueOrThrow({ where: { code: strategyCode } });
  const idempotencyKey = `${caseId}:${strategyCode}:${attemptNumber}`;
  const channel = channelFor(strategyCode);

  let action;
  try {
    action = await prisma.recoveryAction.create({
      data: { caseId, strategyId: strategyRow.id, attemptNumber, status: "EXECUTING", channel, idempotencyKey },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      const existing = await prisma.recoveryAction.findUnique({ where: { idempotencyKey } });
      if (existing) return { status: "IN_PROGRESS", reason: "duplicate execution suppressed by idempotency key", caseId };
    }
    throw err;
  }

  await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "ACTION_IN_PROGRESS", attemptsMade: attemptNumber } });
  await writeAudit({
    caseId,
    entityType: "ACTION",
    entityId: action.id,
    eventType: "ACTION_STARTED",
    actor,
    action: `Executing ${strategyCode} via ${channel} (attempt ${attemptNumber}/${boundedMaxAttempts})`,
    newState: { status: "EXECUTING", strategyCode, channel },
  });

  const useRealApi = razorpayLiveConfigured && LINK_CHANNEL_STRATEGIES.includes(strategyCode);

  if (useRealApi) {
    try {
      const link = await createRecoveryPaymentLink({
        amountPaise: riskCase.amountAtRiskPaise,
        description: `Recovery payment for ${riskCase.sourceType.replace("_", " ").toLowerCase()}`,
        customerName: riskCase.customer.name,
        customerEmail: riskCase.customer.email,
        customerPhone: riskCase.customer.phone,
        referenceId: action.id,
        expireByEpochSeconds: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
      });
      await prisma.recoveryAction.update({
        where: { id: action.id },
        data: { status: "EXECUTING", resultSummary: `Payment link sent: ${link.shortUrl}`, apiResponseSummary: JSON.stringify(link) },
      });
      await writeAudit({
        caseId,
        entityType: "ACTION",
        entityId: action.id,
        eventType: "PAYMENT_LINK_SENT",
        actor: "razorpay_api",
        action: `Real Razorpay TEST-mode payment link created: ${link.shortUrl}`,
        executionResult: link,
      });
      // Real mode resolves asynchronously via webhook (payment_link.paid / payment.failed).
      return { status: "IN_PROGRESS", reason: "awaiting customer action on live payment link", caseId };
    } catch (err) {
      return handleApiFailure(caseId, action.id, attemptNumber, boundedMaxAttempts, boundedCooldownHours, err);
    }
  }

  // DEMO mode (or non-link channels): resolve synchronously via the deterministic simulator
  // so the full loop is observable immediately in a demo run.
  const sim = simulateChannelExecution({
    caseId,
    attemptNumber,
    strategyCode,
    amountAtRiskPaise: riskCase.amountAtRiskPaise,
    expectedRecoveryProbability,
  });

  if (sim.kind === "API_ERROR") {
    return handleApiFailure(caseId, action.id, attemptNumber, boundedMaxAttempts, boundedCooldownHours, new Error(sim.message), sim.apiErrorCode);
  }

  if (sim.kind === "SUCCESS") {
    return resolveSuccess(caseId, action.id, sim.recoveredAmountPaise, riskCase.detectedAt, sim.message);
  }

  return resolveNoRecovery(caseId, action.id, attemptNumber, boundedMaxAttempts, boundedCooldownHours, sim.message);
}

async function handleApiFailure(
  caseId: string,
  actionId: string,
  attemptNumber: number,
  boundedMaxAttempts: number,
  boundedCooldownHours: number,
  err: unknown,
  errorCode = "API_ERROR",
): Promise<CycleResult> {
  const message = err instanceof Error ? err.message : String(err);
  await prisma.recoveryAction.update({ where: { id: actionId }, data: { status: "FAILED", failureCode: errorCode, resultSummary: message } });
  await writeAudit({
    caseId,
    entityType: "ACTION",
    entityId: actionId,
    eventType: "ACTION_API_FAILURE",
    actor: "system",
    action: `Recovery channel API call failed: ${message}`,
    executionResult: { errorCode, message },
  });

  if (attemptNumber < boundedMaxAttempts) {
    const backoffHours = boundedCooldownHours * Math.pow(2, attemptNumber - 1);
    const nextEligibleAt = new Date(Date.now() + backoffHours * 60 * 60 * 1000);
    await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "STRATEGY_SELECTED", nextEligibleAt } });
    await writeAudit({
      caseId,
      entityType: "CASE",
      entityId: caseId,
      eventType: "RETRY_SCHEDULED_AFTER_API_FAILURE",
      actor: "system",
      action: `Bounded retry scheduled after API failure (exponential backoff ${backoffHours}h, attempt ${attemptNumber + 1}/${boundedMaxAttempts})`,
      newState: { nextEligibleAt },
    });
    return { status: "API_ERROR_RETRY_SCHEDULED", reason: message, caseId };
  }

  await prisma.approvalRequest.create({ data: { caseId, reason: `Escalated after ${attemptNumber} API failures: ${message}` } });
  await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "ESCALATED" } });
  await writeAudit({
    caseId,
    entityType: "CASE",
    entityId: caseId,
    eventType: "ESCALATED_AFTER_API_FAILURES",
    actor: "system",
    action: `Escalated to human review after exhausting retries due to repeated API failures`,
  });
  return { status: "ESCALATED", reason: message, caseId };
}

export async function resolveSuccess(caseId: string, actionId: string, recoveredAmountPaise: number, detectedAt: Date, message: string): Promise<CycleResult> {
  const recoveryCostPaise = percentOfPaise(recoveredAmountPaise, 2); // modelled recovery cost: 2% of recovered amount (messaging/link/ops cost)
  const timeToRecoverySeconds = Math.round((Date.now() - detectedAt.getTime()) / 1000);

  await prisma.recoveryAction.update({
    where: { id: actionId },
    data: { status: "SUCCEEDED", executedAt: new Date(), resultSummary: message, recoveredAmountPaise },
  });
  await prisma.recoveryOutcome.create({
    data: { caseId, actionId, outcome: "SUCCESS", recoveredAmountPaise, recoveryCostPaise, timeToRecoverySeconds },
  });

  const riskCase = await prisma.revenueRiskCase.findUniqueOrThrow({ where: { id: caseId } });
  const totalRecovered = riskCase.recoveredAmountPaise + recoveredAmountPaise;
  const fullyRecovered = totalRecovered >= riskCase.amountAtRiskPaise;
  const newStatus = fullyRecovered ? "RECOVERED" : "PARTIALLY_RECOVERED";

  await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: newStatus, recoveredAmountPaise: totalRecovered } });
  await writeAudit({
    caseId,
    entityType: "CASE",
    entityId: caseId,
    eventType: fullyRecovered ? "CASE_RECOVERED" : "CASE_PARTIALLY_RECOVERED",
    actor: "system",
    action: message,
    amountPaise: recoveredAmountPaise,
    newState: { status: newStatus, recoveredAmountPaise: totalRecovered },
  });

  return { status: fullyRecovered ? "RECOVERED" : "PARTIALLY_RECOVERED", caseId };
}

export async function resolveNoRecovery(
  caseId: string,
  actionId: string,
  attemptNumber: number,
  boundedMaxAttempts: number,
  boundedCooldownHours: number,
  message: string,
): Promise<CycleResult> {
  await prisma.recoveryAction.update({ where: { id: actionId }, data: { status: "FAILED", failureCode: "NO_RECOVERY", resultSummary: message } });
  await prisma.recoveryOutcome.create({ data: { caseId, actionId, outcome: "FAILURE", recoveredAmountPaise: 0, recoveryCostPaise: 0 } });

  if (attemptNumber < boundedMaxAttempts) {
    const nextEligibleAt = new Date(Date.now() + boundedCooldownHours * 60 * 60 * 1000);
    await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "STRATEGY_SELECTED", nextEligibleAt } });
    await writeAudit({
      caseId,
      entityType: "CASE",
      entityId: caseId,
      eventType: "RETRY_SCHEDULED",
      actor: "system",
      action: `No recovery yet; next bounded attempt (${attemptNumber + 1}/${boundedMaxAttempts}) eligible at ${nextEligibleAt.toISOString()}`,
    });
    return { status: "API_ERROR_RETRY_SCHEDULED", reason: "no response, retry scheduled", caseId };
  }

  await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "FAILED" } });
  await writeAudit({
    caseId,
    entityType: "CASE",
    entityId: caseId,
    eventType: "CASE_FAILED",
    actor: "system",
    action: `Recovery unsuccessful after ${attemptNumber} bounded attempts; stopping per policy`,
  });
  return { status: "FAILED", reason: "attempts exhausted, no recovery", caseId };
}
