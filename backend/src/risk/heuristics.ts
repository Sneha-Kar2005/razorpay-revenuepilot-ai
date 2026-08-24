import type { RiskCategory } from "../lib/constants.js";

/**
 * Cheap deterministic first-pass guess at a root cause from raw payment
 * error fields, used only as one input signal (heuristicRootCauseHint) into
 * the AI layer — never presented to the user as the final diagnosis.
 */
export function heuristicRootCause(input: {
  sourceType: string;
  errorCode?: string | null;
  errorDescription?: string | null;
  errorStep?: string | null;
  priorFailedAttempts: number;
  daysOverdue?: number;
}): RiskCategory {
  const desc = (input.errorDescription ?? "").toLowerCase();
  const code = (input.errorCode ?? "").toUpperCase();

  if (input.sourceType === "CHECKOUT_ABANDONED") return "checkout_abandonment";
  if (input.sourceType === "RECEIVABLE_OVERDUE") return "invoice_overdue";
  if (input.priorFailedAttempts >= 3) return "repeated_failed_retries";
  if (code.includes("INSUFFICIENT") || desc.includes("insufficient")) return "insufficient_funds";
  if (desc.includes("expired")) return "expired_card";
  if (input.errorStep === "payment_authentication" || desc.includes("otp") || desc.includes("3ds") || desc.includes("authentication")) {
    return "authentication_failure";
  }
  if (desc.includes("timeout") || desc.includes("network") || desc.includes("gateway")) return "network_degradation";
  return "bank_decline";
}
