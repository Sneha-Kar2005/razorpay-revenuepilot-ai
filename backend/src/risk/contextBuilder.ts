import { prisma } from "../db/prisma.js";
import type { CaseContext } from "../ai/context.js";
import type { CustomerSegment, SourceType } from "../lib/constants.js";
import { heuristicRootCause } from "./heuristics.js";

export async function buildCaseContext(caseId: string): Promise<CaseContext> {
  const riskCase = await prisma.revenueRiskCase.findUniqueOrThrow({
    where: { id: caseId },
    include: { customer: true, payment: true, receivable: true },
  });

  const merchantId = riskCase.merchantId;
  const windowStart = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const [recentMerchantFailures, recentMerchantTotal, recentCustomerSuccess] = await Promise.all([
    prisma.payment.count({ where: { merchantId, status: "failed", createdAt: { gte: windowStart } } }),
    prisma.payment.count({ where: { merchantId, createdAt: { gte: windowStart } } }),
    prisma.payment.count({
      where: { customerId: riskCase.customerId, status: "captured", createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const hoursSinceFailure = (Date.now() - riskCase.detectedAt.getTime()) / (1000 * 60 * 60);
  const priorFailedAttempts = riskCase.payment?.retryCount ?? riskCase.attemptsMade;

  const heuristicHint = heuristicRootCause({
    sourceType: riskCase.sourceType,
    errorCode: riskCase.payment?.errorCode,
    errorDescription: riskCase.payment?.errorDescription,
    errorStep: riskCase.payment?.errorStep,
    priorFailedAttempts,
    daysOverdue: riskCase.receivable?.daysOverdue,
  });

  return {
    caseId: riskCase.id,
    sourceType: riskCase.sourceType as SourceType,
    amountAtRiskPaise: riskCase.amountAtRiskPaise,
    currency: riskCase.currency,
    customerSegment: riskCase.customer.segment as CustomerSegment,
    customerLifetimeValuePaise: riskCase.customer.lifetimeValuePaise,
    customerOptedOut: riskCase.customer.optedOutOfContact,
    priorFailedAttempts,
    hoursSinceFailure,
    paymentMethod: riskCase.payment?.method,
    errorCode: riskCase.payment?.errorCode ?? undefined,
    errorDescription: riskCase.payment?.errorDescription ?? undefined,
    errorSource: riskCase.payment?.errorSource ?? undefined,
    errorStep: riskCase.payment?.errorStep ?? undefined,
    hadRecentSuccessfulPayment: recentCustomerSuccess > 0,
    recentFailureSpikeAcrossMerchant: recentMerchantTotal > 5 && recentMerchantFailures / Math.max(recentMerchantTotal, 1) > 0.3,
    daysOverdue: riskCase.receivable?.daysOverdue,
    isSuspicious: riskCase.riskCategory === "suspicious_transaction",
    heuristicRootCauseHint: heuristicHint,
  };
}
