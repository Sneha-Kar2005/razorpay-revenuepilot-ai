import { prisma } from "../db/prisma.js";
import { resolveSuccess, resolveNoRecovery } from "./executor.js";

/**
 * Completes a RecoveryAction that was left in EXECUTING state pending a
 * real Razorpay webhook (payment_link.paid / payment.captured / payment.failed).
 * Shares the exact same success/failure state-transition + audit logic as
 * the synchronous DEMO-mode path so RAZORPAY_TEST and DEMO mode produce
 * identically-shaped audit trails and metrics.
 */
export async function resolveActionFromWebhook(actionId: string, outcome: "SUCCESS" | "FAILURE", amountPaise: number) {
  const action = await prisma.recoveryAction.findUniqueOrThrow({ where: { id: actionId } });
  const riskCase = await prisma.revenueRiskCase.findUniqueOrThrow({ where: { id: action.caseId } });
  const latestDecision = await prisma.agentDecision.findFirst({ where: { caseId: action.caseId }, orderBy: { createdAt: "desc" } });
  const boundedMaxAttempts = latestDecision?.maxAttempts ?? 1;
  const boundedCooldownHours = latestDecision?.cooldownHours ?? 4;

  if (outcome === "SUCCESS") {
    return resolveSuccess(action.caseId, action.id, amountPaise || riskCase.amountAtRiskPaise, riskCase.detectedAt, "Customer completed payment via live Razorpay payment link (confirmed by webhook)");
  }
  return resolveNoRecovery(action.caseId, action.id, action.attemptNumber, boundedMaxAttempts, boundedCooldownHours, "Payment link expired or failed (confirmed by webhook)");
}
