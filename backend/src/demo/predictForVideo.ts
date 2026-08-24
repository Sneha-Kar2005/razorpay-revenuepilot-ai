/**
 * One-off, read-only reconnaissance script used only to pick good camera
 * subjects for the pitch video: it replicates the exact deterministic
 * decision -> policy -> simulated-execution pipeline WITHOUT writing
 * anything to the database, so it can classify every DETECTED case's
 * predicted first-cycle outcome ahead of time. Not part of the shipped
 * product; not imported anywhere else.
 */
import { prisma } from "../db/prisma.js";
import { buildCaseContext } from "../risk/contextBuilder.js";
import { runSimulatedAgent } from "../ai/simulated.js";
import { evaluatePolicy } from "../policy/engine.js";
import { simulateChannelExecution } from "../razorpay/demoSimulator.js";
import type { StrategyCode } from "../lib/constants.js";

async function main() {
  const cases = await prisma.revenueRiskCase.findMany({ where: { status: "DETECTED" }, include: { customer: true } });

  const successCandidates: { id: string; name: string; amount: number }[] = [];
  const escalateCandidates: { id: string; name: string; amount: number }[] = [];
  const retryCandidates: { id: string; name: string; amount: number }[] = [];

  for (const c of cases) {
    const ctx = await buildCaseContext(c.id);
    const decision = runSimulatedAgent(ctx);
    const policy = evaluatePolicy(ctx, decision);
    if (!policy.allowed || policy.requiresApproval) continue;

    const sim = simulateChannelExecution({
      caseId: c.id,
      attemptNumber: 1,
      strategyCode: decision.recommendedStrategyCode as StrategyCode,
      amountAtRiskPaise: c.amountAtRiskPaise,
      expectedRecoveryProbability: decision.expectedRecoveryProbability,
    });

    const row = { id: c.id, name: c.customer.name, amount: c.amountAtRiskPaise };
    if (sim.kind === "SUCCESS" && sim.recoveredAmountPaise >= c.amountAtRiskPaise) successCandidates.push(row);
    if (sim.kind === "API_ERROR" && Math.max(policy.boundedMaxAttempts, 1) === 1) escalateCandidates.push(row);
    if (sim.kind === "API_ERROR" && Math.max(policy.boundedMaxAttempts, 1) > 1) retryCandidates.push(row);
  }

  console.log("SUCCESS candidates (full recovery, attempt 1):", successCandidates.slice(0, 5));
  console.log("ESCALATE candidates (API error, maxAttempts=1 -> immediate escalation):", escalateCandidates.slice(0, 5));
  console.log("RETRY candidates (API error, retry will be scheduled):", retryCandidates.slice(0, 5));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
