import type { CustomerSegment, SourceType } from "../lib/constants.js";

export interface PriorityInput {
  amountAtRiskPaise: number;
  customerSegment: CustomerSegment;
  sourceType: SourceType;
  hoursSinceEvent: number;
  daysOverdue?: number;
}

const SEGMENT_WEIGHT: Record<CustomerSegment, number> = {
  VIP: 1.5,
  HIGH_VALUE: 1.25,
  STANDARD: 1.0,
  NEW: 0.9,
};

const SOURCE_WEIGHT: Record<SourceType, number> = {
  FAILED_PAYMENT: 1.2,
  SUBSCRIPTION_DEGRADED: 1.15,
  RECEIVABLE_OVERDUE: 1.1,
  CHECKOUT_ABANDONED: 0.9,
};

/**
 * Deterministic 0-100 priority score used to order the revenue-at-risk
 * queue. Larger amount, higher-value customer, and time-decaying urgency
 * push a case up the queue; very stale cases decay back down since recovery
 * odds fall the longer a case sits untouched.
 */
export function computePriorityScore(input: PriorityInput): number {
  const amountFactor = Math.log10(Math.max(input.amountAtRiskPaise, 100) / 100 + 1); // log scale on rupees
  const segmentFactor = SEGMENT_WEIGHT[input.customerSegment];
  const sourceFactor = SOURCE_WEIGHT[input.sourceType];

  // urgency peaks in the first 48h then decays - very old cases are less recoverable
  const hours = Math.max(input.hoursSinceEvent, 0);
  const urgencyFactor = hours <= 48 ? 1 + hours / 48 : Math.max(0.4, 2 - (hours - 48) / 240);

  const overdueFactor = input.daysOverdue ? 1 + Math.min(input.daysOverdue, 90) / 90 : 1;

  const raw = amountFactor * segmentFactor * sourceFactor * urgencyFactor * overdueFactor;
  // squash into 0-100 with a smooth cap
  const score = 100 * (1 - Math.exp(-raw / 6));
  return Math.round(score * 100) / 100;
}
