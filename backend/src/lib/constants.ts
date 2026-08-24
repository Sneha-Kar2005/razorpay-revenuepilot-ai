export const RISK_CATEGORIES = [
  "insufficient_funds",
  "authentication_failure",
  "bank_decline",
  "expired_card",
  "temporary_issuer_failure",
  "network_degradation",
  "checkout_abandonment",
  "repeated_failed_retries",
  "invoice_overdue",
  "customer_inactivity",
  "suspicious_transaction",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const SOURCE_TYPES = [
  "FAILED_PAYMENT",
  "CHECKOUT_ABANDONED",
  "SUBSCRIPTION_DEGRADED",
  "RECEIVABLE_OVERDUE",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const CASE_STATUSES = [
  "DETECTED",
  "DIAGNOSED",
  "STRATEGY_SELECTED",
  "POLICY_REVIEW",
  "AWAITING_APPROVAL",
  "ACTION_IN_PROGRESS",
  "RECOVERED",
  "PARTIALLY_RECOVERED",
  "FAILED",
  "ESCALATED",
  "STOPPED",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const STRATEGY_CATALOG = [
  {
    code: "SMART_RETRY",
    name: "Smart Retry",
    description: "Immediate retry via the original payment method for transient/network failures.",
    category: "retry",
  },
  {
    code: "DELAYED_RETRY",
    name: "Delayed Retry (Cooldown)",
    description: "Retry after a cooldown window, used for issuer/bank temporary declines.",
    category: "retry",
  },
  {
    code: "PAYMENT_LINK",
    name: "Payment Link Recovery",
    description: "Send a fresh Razorpay Payment Link so the customer can complete payment on their terms.",
    category: "link",
  },
  {
    code: "REMINDER",
    name: "Customer Reminder",
    description: "Send a low-friction SMS/email reminder for abandoned checkouts or upcoming dues.",
    category: "nudge",
  },
  {
    code: "ALT_METHOD",
    name: "Alternative Payment Method Prompt",
    description: "Prompt the customer to try a different payment method (e.g. UPI instead of a declined card).",
    category: "nudge",
  },
  {
    code: "ESCALATION",
    name: "High-Value Escalation",
    description: "Escalate to a human agent for high-value or repeatedly-failed cases requiring judgement.",
    category: "human",
  },
  {
    code: "RECEIVABLE_FOLLOWUP",
    name: "B2B Receivable Follow-up",
    description: "Structured chaser sequence (reminder → escalation → promise-to-pay tracking) for overdue invoices.",
    category: "receivable",
  },
  {
    code: "STOP",
    name: "Stop / Do Not Contact",
    description: "Halt all recovery activity on this case (opt-out, policy violation, or exhausted attempts).",
    category: "stop",
  },
] as const;
export type StrategyCode = (typeof STRATEGY_CATALOG)[number]["code"];

export const CUSTOMER_SEGMENTS = ["NEW", "STANDARD", "HIGH_VALUE", "VIP"] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];
