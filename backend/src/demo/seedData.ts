import { prisma } from "../db/prisma.js";
import { env } from "../lib/env.js";
import { makeRng, weightedPick, randInt } from "../lib/rng.js";
import { computePriorityScore } from "../risk/priority.js";
import { heuristicRootCause } from "../risk/heuristics.js";
import { writeAudit } from "../lib/audit.js";
import { STRATEGY_CATALOG, type CustomerSegment, type SourceType } from "../lib/constants.js";
import { AMOUNT_TIERS_PAISE, CITIES, FAILURE_SAMPLES, PAYMENT_METHODS, fullName } from "./syntheticData.js";

const MERCHANT_EMAIL = "demo-merchant@revenuepilot.test";

async function seedStrategyCatalog() {
  for (const s of STRATEGY_CATALOG) {
    await prisma.recoveryStrategy.upsert({
      where: { code: s.code },
      update: { name: s.name, description: s.description, category: s.category },
      create: { code: s.code, name: s.name, description: s.description, category: s.category },
    });
  }
}

export async function seedDemoData() {
  console.log(`Seeding RevenuePilot demo data (seed="${env.demoSeed}", cases=${env.demoCaseCount})...`);
  const rng = makeRng(env.demoSeed);

  await seedStrategyCatalog();

  const merchant = await prisma.merchant.upsert({
    where: { email: MERCHANT_EMAIL },
    update: {},
    create: { name: "Aarambh Retail Pvt Ltd (Demo Merchant)", email: MERCHANT_EMAIL, mode: "DEMO" },
  });

  // Clear existing demo data for this merchant so the seed is repeatable.
  const existingCaseIds = (await prisma.revenueRiskCase.findMany({ where: { merchantId: merchant.id }, select: { id: true } })).map((c) => c.id);
  if (existingCaseIds.length) {
    await prisma.auditEvent.deleteMany({ where: { caseId: { in: existingCaseIds } } });
    await prisma.recoveryOutcome.deleteMany({ where: { caseId: { in: existingCaseIds } } });
    await prisma.recoveryAction.deleteMany({ where: { caseId: { in: existingCaseIds } } });
    await prisma.approvalRequest.deleteMany({ where: { caseId: { in: existingCaseIds } } });
    await prisma.policyDecision.deleteMany({ where: { caseId: { in: existingCaseIds } } });
    await prisma.agentDecision.deleteMany({ where: { caseId: { in: existingCaseIds } } });
    await prisma.revenueRiskCase.deleteMany({ where: { merchantId: merchant.id } });
  }
  await prisma.paymentAttempt.deleteMany({ where: { payment: { merchantId: merchant.id } } });
  await prisma.payment.deleteMany({ where: { merchantId: merchant.id } });
  await prisma.receivable.deleteMany({ where: { merchantId: merchant.id } });
  await prisma.customer.deleteMany({ where: { merchantId: merchant.id } });

  const customerCount = Math.max(40, Math.round(env.demoCaseCount * 0.6));
  const segmentWeights: { value: CustomerSegment; weight: number }[] = [
    { value: "NEW", weight: 30 },
    { value: "STANDARD", weight: 45 },
    { value: "HIGH_VALUE", weight: 18 },
    { value: "VIP", weight: 7 },
  ];

  const customers = [];
  for (let i = 0; i < customerCount; i++) {
    const { first, last } = fullName(rng);
    const segment = weightedPick(rng, segmentWeights);
    const city = CITIES[Math.floor(rng() * CITIES.length)];
    const optedOut = rng() < 0.03;
    const ltvPaise = randInt(rng, 5_000, segment === "VIP" ? 500_000 : segment === "HIGH_VALUE" ? 200_000 : 50_000) * 100;
    const customer = await prisma.customer.create({
      data: {
        merchantId: merchant.id,
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.test`,
        phone: `9${randInt(rng, 100000000, 999999999)}`,
        segment,
        lifetimeValuePaise: ltvPaise,
        optedOutOfContact: optedOut,
      },
    });
    customers.push({ ...customer, city });
  }

  const sourceWeights: { value: SourceType; weight: number }[] = [
    { value: "FAILED_PAYMENT", weight: 45 },
    { value: "CHECKOUT_ABANDONED", weight: 28 },
    { value: "SUBSCRIPTION_DEGRADED", weight: 10 },
    { value: "RECEIVABLE_OVERDUE", weight: 17 },
  ];

  let created = 0;
  for (let i = 0; i < env.demoCaseCount; i++) {
    const customer = customers[Math.floor(rng() * customers.length)];
    const sourceType = weightedPick(rng, sourceWeights);
    const amountPaise = AMOUNT_TIERS_PAISE[Math.floor(Math.pow(rng(), 1.8) * AMOUNT_TIERS_PAISE.length)]; // skew toward lower tiers
    const hoursAgo = randInt(rng, 1, 30 * 24);
    const detectedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const isSuspicious = rng() < 0.02;
    const retryCount = sourceType === "FAILED_PAYMENT" ? randInt(rng, 0, 3) : 0;

    let paymentId: string | undefined;
    let receivableId: string | undefined;
    let errorFields = { errorCode: undefined as string | undefined, errorDescription: undefined as string | undefined, errorSource: undefined as string | undefined, errorStep: undefined as string | undefined, errorReason: undefined as string | undefined };

    if (sourceType === "FAILED_PAYMENT" || sourceType === "SUBSCRIPTION_DEGRADED" || sourceType === "CHECKOUT_ABANDONED") {
      const method = PAYMENT_METHODS[Math.floor(rng() * PAYMENT_METHODS.length)];
      const failure = FAILURE_SAMPLES[Math.floor(rng() * FAILURE_SAMPLES.length)];
      const status = sourceType === "CHECKOUT_ABANDONED" ? "created" : "failed";
      if (status === "failed") errorFields = failure;
      const payment = await prisma.payment.create({
        data: {
          merchantId: merchant.id,
          customerId: customer.id,
          razorpayOrderId: `order_DEMO${i.toString().padStart(5, "0")}`,
          razorpayPaymentId: status === "failed" ? `pay_DEMO${i.toString().padStart(5, "0")}` : null,
          amountPaise,
          method,
          status,
          errorCode: errorFields.errorCode ?? null,
          errorDescription: errorFields.errorDescription ?? null,
          errorSource: errorFields.errorSource ?? null,
          errorStep: errorFields.errorStep ?? null,
          errorReason: errorFields.errorReason ?? null,
          retryCount,
          createdAt: detectedAt,
        },
      });
      for (let a = 0; a < retryCount; a++) {
        await prisma.paymentAttempt.create({
          data: {
            paymentId: payment.id,
            attemptNumber: a + 1,
            status: "failed",
            method,
            errorCode: failure.errorCode,
            errorDescription: failure.errorDescription,
            createdAt: new Date(detectedAt.getTime() - (retryCount - a) * 60 * 60 * 1000),
          },
        });
      }
      paymentId = payment.id;
    } else {
      const daysOverdue = randInt(rng, 1, 75);
      const receivable = await prisma.receivable.create({
        data: {
          merchantId: merchant.id,
          customerId: customer.id,
          invoiceNumber: `INV-2026-${(1000 + i).toString()}`,
          amountPaise: Math.max(amountPaise, 500000),
          dueDate: new Date(Date.now() - daysOverdue * 24 * 60 * 60 * 1000),
          status: "OVERDUE",
          daysOverdue,
        },
      });
      receivableId = receivable.id;
    }

    const riskCategory = isSuspicious
      ? "suspicious_transaction"
      : heuristicRootCause({
          sourceType,
          errorCode: errorFields.errorCode,
          errorDescription: errorFields.errorDescription,
          errorStep: errorFields.errorStep,
          priorFailedAttempts: retryCount,
          daysOverdue: undefined,
        });

    const priorityScore = computePriorityScore({
      amountAtRiskPaise: amountPaise,
      customerSegment: customer.segment as CustomerSegment,
      sourceType,
      hoursSinceEvent: hoursAgo,
    });

    const riskCase = await prisma.revenueRiskCase.create({
      data: {
        merchantId: merchant.id,
        customerId: customer.id,
        sourceType,
        paymentId,
        receivableId,
        amountAtRiskPaise: sourceType === "RECEIVABLE_OVERDUE" ? Math.max(amountPaise, 500000) : amountPaise,
        riskCategory,
        priorityScore,
        status: "DETECTED",
        maxAttempts: env.policyMaxRetries,
        detectedAt,
      },
    });

    await writeAudit({
      caseId: riskCase.id,
      entityType: "CASE",
      entityId: riskCase.id,
      eventType: "CASE_DETECTED",
      actor: "risk_detector",
      action: `Revenue-at-risk case detected: ${sourceType} for ${customer.name}, amount at risk ₹${(riskCase.amountAtRiskPaise / 100).toLocaleString("en-IN")}`,
      newState: { status: "DETECTED", amountAtRiskPaise: riskCase.amountAtRiskPaise },
    });
    created++;
  }

  console.log(`Seed complete: merchant=${merchant.id}, customers=${customers.length}, riskCases=${created}`);
  return { merchantId: merchant.id, customerCount: customers.length, caseCount: created };
}
