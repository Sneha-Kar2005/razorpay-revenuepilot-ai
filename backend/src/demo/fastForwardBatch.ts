/**
 * One-off pitch-video preparation script: processes every DETECTED case
 * EXCEPT the two reserved ids (kept untouched so they can be run live on
 * camera), then simulates cooldown time passing between waves so bounded
 * retries and API-failure escalations actually play out — producing a
 * real, rich dataset for the Analytics screen and a genuine
 * escalated-via-API-failure case to show in the video. Not part of the
 * shipped product.
 */
import { prisma } from "../db/prisma.js";
import { runRecoveryCycle } from "../strategy/executor.js";

const RESERVED = new Set(process.argv.slice(2));

async function wave() {
  const eligible = await prisma.revenueRiskCase.findMany({
    where: {
      status: { in: ["DETECTED", "DIAGNOSED", "STRATEGY_SELECTED"] },
      OR: [{ nextEligibleAt: null }, { nextEligibleAt: { lte: new Date() } }],
    },
    select: { id: true },
  });
  let count = 0;
  for (const c of eligible) {
    if (RESERVED.has(c.id)) continue;
    await runRecoveryCycle(c.id, "video_prep_batch");
    count++;
  }
  return count;
}

async function fastForwardCooldowns() {
  // Simulate time passing so bounded retries become eligible again.
  await prisma.revenueRiskCase.updateMany({
    where: { nextEligibleAt: { not: null }, id: { notIn: [...RESERVED] } },
    data: { nextEligibleAt: new Date(0) },
  });
}

async function main() {
  console.log("Reserved (untouched) case ids:", [...RESERVED]);
  for (let waveNum = 1; waveNum <= 4; waveNum++) {
    const n = await wave();
    console.log(`Wave ${waveNum}: processed ${n} cases`);
    await fastForwardCooldowns();
  }

  const escalatedViaApiFailure = await prisma.revenueRiskCase.findMany({
    where: { status: "ESCALATED", actions: { some: { failureCode: "SIMULATED_GATEWAY_TIMEOUT" } } },
    include: { customer: true },
    take: 3,
  });
  console.log(
    "Escalated-via-API-failure cases for segment 5:",
    escalatedViaApiFailure.map((c) => ({ id: c.id, name: c.customer.name, amount: c.amountAtRiskPaise })),
  );

  const statusCounts = await prisma.revenueRiskCase.groupBy({ by: ["status"], _count: true });
  console.log("Final status breakdown:", statusCounts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
