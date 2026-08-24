import type { RiskCategory, SourceType, CustomerSegment } from "../lib/constants.js";

/** Everything the AI (real or simulated) is given about a case. No PII beyond synthetic demo fields. */
export interface CaseContext {
  caseId: string;
  sourceType: SourceType;
  amountAtRiskPaise: number;
  currency: string;
  customerSegment: CustomerSegment;
  customerLifetimeValuePaise: number;
  customerOptedOut: boolean;
  priorFailedAttempts: number;
  hoursSinceFailure: number;
  paymentMethod?: string;
  errorCode?: string;
  errorDescription?: string;
  errorSource?: string;
  errorStep?: string;
  hadRecentSuccessfulPayment: boolean;
  recentFailureSpikeAcrossMerchant: boolean;
  daysOverdue?: number;
  isSuspicious: boolean;
  // Weak, non-authoritative hint pre-computed by the deterministic risk
  // detector. The AI may agree, disagree, or refine it — it is never
  // treated as ground truth downstream, only as one of the input signals.
  heuristicRootCauseHint: RiskCategory;
}
