import { z } from "zod";
import { RISK_CATEGORIES } from "../lib/constants.js";

/**
 * Structured contract the AI layer (real or simulated) must satisfy.
 * Nothing downstream ever executes a financial action from free-text —
 * every field here is validated before it reaches the policy engine.
 * Money fields are advisory (used for prioritisation/expected-value only);
 * the ledger is always computed by deterministic code, never by this output.
 */
export const AgentDecisionSchema = z.object({
  rootCause: z.enum(RISK_CATEGORIES),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string()).min(1).max(8),
  recommendedStrategyCode: z.enum([
    "SMART_RETRY",
    "DELAYED_RETRY",
    "PAYMENT_LINK",
    "REMINDER",
    "ALT_METHOD",
    "ESCALATION",
    "RECEIVABLE_FOLLOWUP",
    "STOP",
  ]),
  recommendedReason: z.string().min(1).max(400),
  expectedRecoveryProbability: z.number().min(0).max(1),
  expectedRecoveredAmountPaise: z.number().int().min(0),
  maxAttempts: z.number().int().min(0).max(5),
  cooldownHours: z.number().int().min(0).max(240),
  stoppingConditions: z.array(z.string()).min(1).max(6),
  escalationCondition: z.string().min(1).max(300),
  complianceNotes: z.string().min(1).max(300),
});
export type AgentDecisionOutput = z.infer<typeof AgentDecisionSchema>;

export const AgentDecisionEnvelopeSchema = z.object({
  decision: AgentDecisionSchema,
  provider: z.enum(["claude", "simulated"]),
  modelId: z.string().optional(),
});
export type AgentDecisionEnvelope = z.infer<typeof AgentDecisionEnvelopeSchema>;
