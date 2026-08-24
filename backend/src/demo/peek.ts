import { prisma } from "../db/prisma.js";

async function main() {
  const rows = await prisma.revenueRiskCase.findMany({
    where: { status: "AWAITING_APPROVAL" },
    include: { customer: true, agentDecisions: true },
    orderBy: { amountAtRiskPaise: "desc" },
    take: 8,
  });
  for (const r of rows) {
    console.log(r.id, r.customer.name, r.amountAtRiskPaise, r.sourceType, r.agentDecisions.at(-1)?.recommendedStrategyCode);
  }
}
main().finally(() => prisma.$disconnect());
