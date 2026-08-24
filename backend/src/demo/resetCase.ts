/**
 * One-off pitch-video helper: rewinds a single case back to its pristine
 * DETECTED state (deleting decisions/policy/actions/outcomes/audit events
 * created by a prior run of it) so it can be re-recorded on camera without
 * a full dataset reseed. Not part of the shipped product.
 */
import { prisma } from "../db/prisma.js";

const caseId = process.argv[2];
if (!caseId) {
  console.error("usage: tsx resetCase.ts <caseId>");
  process.exit(1);
}

async function main() {
  await prisma.auditEvent.deleteMany({ where: { caseId } });
  await prisma.recoveryOutcome.deleteMany({ where: { caseId } });
  await prisma.recoveryAction.deleteMany({ where: { caseId } });
  await prisma.approvalRequest.deleteMany({ where: { caseId } });
  await prisma.policyDecision.deleteMany({ where: { caseId } });
  await prisma.agentDecision.deleteMany({ where: { caseId } });
  await prisma.revenueRiskCase.update({
    where: { id: caseId },
    data: { status: "DETECTED", attemptsMade: 0, recoveredAmountPaise: 0, nextEligibleAt: null },
  });
  console.log(`Reset ${caseId} to DETECTED`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
