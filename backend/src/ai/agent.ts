import { aiLiveConfigured, env } from "../lib/env.js";
import type { CaseContext } from "./context.js";
import { AgentDecisionSchema, type AgentDecisionOutput } from "./schema.js";
import { runSimulatedAgent } from "./simulated.js";
import { runClaudeAgent } from "./claudeProvider.js";

export interface AgentRunResult {
  decision: AgentDecisionOutput;
  provider: "claude" | "simulated";
  modelId?: string;
  degraded: boolean; // true if a live call was attempted but fell back to simulated
  error?: string;
}

/**
 * Single entry point used by the risk pipeline. Live Claude calls are only
 * attempted when a real API key is configured; otherwise (or on any error /
 * schema-validation failure from the live call) it falls back to the
 * deterministic simulated engine so a case is NEVER left undiagnosed. The
 * `provider` field is what the UI and audit trail use to label the result
 * honestly — simulated output is never presented as live model output.
 */
export async function runAgent(ctx: CaseContext): Promise<AgentRunResult> {
  if (!aiLiveConfigured) {
    return { decision: runSimulatedAgent(ctx), provider: "simulated", degraded: false };
  }

  try {
    const raw = await runClaudeAgent(ctx);
    const decision = AgentDecisionSchema.parse(raw);
    return { decision, provider: "claude", modelId: env.anthropicModel, degraded: false };
  } catch (err) {
    return {
      decision: runSimulatedAgent(ctx),
      provider: "simulated",
      degraded: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
