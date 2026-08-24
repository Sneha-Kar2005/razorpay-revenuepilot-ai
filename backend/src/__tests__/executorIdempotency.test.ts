import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";
import { executeApprovedStrategy } from "../strategy/executor.js";
import { STRATEGY_CATALOG } from "../lib/constants.js";

let merchantId: string;
let customerId: string;
let caseId: string;

beforeAll(async () => {
  for (const s of STRATEGY_CATALOG) {
    await prisma.recoveryStrategy.upsert({
      where: { code: s.code },
      update: {},
      create: { code: s.code, name: s.name, description: s.description, category: s.category },
    });
  }

  const merchant = await prisma.merchant.create({
    data: { name: "Test Merchant (vitest)", email: `vitest-merchant-${Date.now()}@example.test` },
  });
  merchantId = merchant.id;

  const customer = await prisma.customer.create({
    data: {
      merchantId,
      name: "Test Customer",
      email: "test.customer@example.test",
      phone: "9000000000",
      segment: "STANDARD",
      lifetimeValuePaise: 100000,
    },
  });
  customerId = customer.id;

  const riskCase = await prisma.revenueRiskCase.create({
    data: {
      merchantId,
      customerId,
      sourceType: "FAILED_PAYMENT",
      amountAtRiskPaise: 49900,
      riskCategory: "bank_decline",
      status: "DIAGNOSED",
      maxAttempts: 2,
    },
  });
  caseId = riskCase.id;
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { caseId } });
  await prisma.recoveryOutcome.deleteMany({ where: { caseId } });
  await prisma.recoveryAction.deleteMany({ where: { caseId } });
  await prisma.revenueRiskCase.delete({ where: { id: caseId } });
  await prisma.customer.delete({ where: { id: customerId } });
  await prisma.merchant.delete({ where: { id: merchantId } });
});

describe("bounded executor: duplicate-action protection", () => {
  it("never creates two RecoveryAction rows for the same case+strategy+attempt even under concurrent duplicate triggers", async () => {
    // Simulates two near-simultaneous triggers for the same attempt (e.g. a
    // duplicate webhook delivery racing a demo-batch run). The unique
    // idempotencyKey constraint at the DB layer must make this safe.
    const [a, b] = await Promise.all([
      executeApprovedStrategy(caseId, "SMART_RETRY", 2, 1, 0.5, "test_concurrent_a"),
      executeApprovedStrategy(caseId, "SMART_RETRY", 2, 1, 0.5, "test_concurrent_b"),
    ]);

    const actions = await prisma.recoveryAction.findMany({ where: { caseId, attemptNumber: 1 } });
    expect(actions.length).toBe(1);

    // Exactly one of the two concurrent triggers should have been
    // suppressed as a duplicate by the idempotency key.
    const dedupedCount = [a, b].filter((r) => r.reason?.includes("duplicate")).length;
    expect(dedupedCount).toBe(1);
  });

  it("writes an audit event for the action that actually executed", async () => {
    const events = await prisma.auditEvent.findMany({ where: { caseId, eventType: "ACTION_STARTED" } });
    expect(events.length).toBe(1);
  });

  it("does not double-count attemptsMade on the case from the duplicate trigger", async () => {
    const riskCase = await prisma.revenueRiskCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(riskCase.attemptsMade).toBe(1);
  });
});
