import Anthropic from "@anthropic-ai/sdk";
import { env } from "../lib/env.js";
import type { CaseContext } from "./context.js";
import { AgentDecisionSchema, type AgentDecisionOutput } from "./schema.js";

const TOOL_NAME = "submit_recovery_decision";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

const decisionTool: Anthropic.Tool = {
  name: TOOL_NAME,
  description:
    "Submit the structured revenue-recovery decision for this case. This is the ONLY way to respond — always call this tool, never answer in plain text.",
  input_schema: {
    type: "object",
    properties: {
      rootCause: {
        type: "string",
        enum: [
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
        ],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      signals: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
      recommendedStrategyCode: {
        type: "string",
        enum: ["SMART_RETRY", "DELAYED_RETRY", "PAYMENT_LINK", "REMINDER", "ALT_METHOD", "ESCALATION", "RECEIVABLE_FOLLOWUP", "STOP"],
      },
      recommendedReason: { type: "string" },
      expectedRecoveryProbability: { type: "number", minimum: 0, maximum: 1 },
      expectedRecoveredAmountPaise: { type: "integer", minimum: 0 },
      maxAttempts: { type: "integer", minimum: 0, maximum: 5 },
      cooldownHours: { type: "integer", minimum: 0, maximum: 240 },
      stoppingConditions: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
      escalationCondition: { type: "string" },
      complianceNotes: { type: "string" },
    },
    required: [
      "rootCause",
      "confidence",
      "signals",
      "recommendedStrategyCode",
      "recommendedReason",
      "expectedRecoveryProbability",
      "expectedRecoveredAmountPaise",
      "maxAttempts",
      "cooldownHours",
      "stoppingConditions",
      "escalationCondition",
      "complianceNotes",
    ],
  },
};

function buildPrompt(ctx: CaseContext): string {
  return `You are the root-cause and recovery-strategy component of RevenuePilot AI, a bounded revenue recovery agent for an Indian payments merchant using Razorpay.

You are given ONE revenue-risk case. Analyze it using ONLY the facts provided below — never invent facts not present in the context, and never claim certainty the data does not support. Ground every conclusion in the given signals.

You do not have the authority to execute any financial action yourself. You only recommend a strategy code from a fixed catalog; a separate deterministic policy engine will validate and bound your recommendation before anything executes.

Case context (JSON):
${JSON.stringify(ctx, null, 2)}

Strategy catalog you may choose from:
- SMART_RETRY: immediate retry, for transient one-off failures
- DELAYED_RETRY: retry after a cooldown, for temporary issuer/network issues
- PAYMENT_LINK: send a fresh payment link, for stale abandonment or dead payment methods
- REMINDER: low-friction nudge, for recent abandonment or insufficient funds
- ALT_METHOD: prompt a different payment method, for expired card / auth failures
- ESCALATION: hand off to a human, for high-value or repeatedly-failed cases
- RECEIVABLE_FOLLOWUP: structured B2B chaser sequence, for overdue invoices
- STOP: halt all contact, for opt-outs, suspicious transactions, or exhausted attempts

Call the ${TOOL_NAME} tool with your structured decision now.`;
}

/**
 * Calls the real Claude API with a forced tool call so the model can only
 * return the exact structured shape the rest of the pipeline expects. The
 * result is still re-validated with the same Zod schema used for the
 * simulated engine before anything downstream sees it.
 */
export async function runClaudeAgent(ctx: CaseContext): Promise<AgentDecisionOutput> {
  const response = await getClient().messages.create({
    model: env.anthropicModel,
    max_tokens: 1024,
    tools: [decisionTool],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: buildPrompt(ctx) }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME,
  );
  if (!toolUse) {
    throw new Error("Claude did not return a tool_use block for submit_recovery_decision");
  }

  return AgentDecisionSchema.parse(toolUse.input);
}
