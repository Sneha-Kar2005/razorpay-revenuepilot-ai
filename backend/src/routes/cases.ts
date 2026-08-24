import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { runRecoveryCycle, executeApprovedStrategy } from "../strategy/executor.js";
import { writeAudit } from "../lib/audit.js";

export const casesRouter = Router();

const listQuerySchema = z.object({
  status: z.string().optional(),
  sourceType: z.string().optional(),
  riskCategory: z.string().optional(),
  segment: z.string().optional(),
  minAmountPaise: z.coerce.number().optional(),
  maxAmountPaise: z.coerce.number().optional(),
  recovered: z.enum(["true", "false"]).optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(50),
});

casesRouter.get("/", async (req, res, next) => {
  try {
    const q = listQuerySchema.parse(req.query);
    const where: any = {};
    if (q.status) where.status = q.status;
    if (q.sourceType) where.sourceType = q.sourceType;
    if (q.riskCategory) where.riskCategory = q.riskCategory;
    if (q.segment) where.customer = { segment: q.segment };
    if (q.minAmountPaise || q.maxAmountPaise) {
      where.amountAtRiskPaise = {};
      if (q.minAmountPaise) where.amountAtRiskPaise.gte = q.minAmountPaise;
      if (q.maxAmountPaise) where.amountAtRiskPaise.lte = q.maxAmountPaise;
    }
    if (q.recovered === "true") where.status = { in: ["RECOVERED", "PARTIALLY_RECOVERED"] };
    if (q.recovered === "false") where.status = { notIn: ["RECOVERED", "PARTIALLY_RECOVERED"] };
    if (q.search) where.customer = { ...(where.customer ?? {}), name: { contains: q.search } };

    const [total, cases] = await Promise.all([
      prisma.revenueRiskCase.count({ where }),
      prisma.revenueRiskCase.findMany({
        where,
        include: { customer: true, payment: true, receivable: true },
        orderBy: [{ priorityScore: "desc" }, { detectedAt: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({ total, page: q.page, pageSize: q.pageSize, cases });
  } catch (err) {
    next(err);
  }
});

casesRouter.get("/:id", async (req, res, next) => {
  try {
    const riskCase = await prisma.revenueRiskCase.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        payment: { include: { attempts: true } },
        receivable: true,
        agentDecisions: { orderBy: { createdAt: "asc" } },
        policyDecisions: { orderBy: { createdAt: "asc" } },
        actions: { include: { strategy: true, outcomes: true }, orderBy: { createdAt: "asc" } },
        outcomes: { orderBy: { createdAt: "asc" } },
        approvalRequests: { orderBy: { requestedAt: "asc" } },
        auditEvents: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!riskCase) return res.status(404).json({ error: "case not found" });
    res.json(riskCase);
  } catch (err) {
    next(err);
  }
});

casesRouter.post("/:id/run", async (req, res, next) => {
  try {
    const result = await runRecoveryCycle(req.params.id, "merchant_ui");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const approveSchema = z.object({
  approve: z.boolean(),
  notes: z.string().max(500).optional(),
  decidedBy: z.string().default("merchant_operator"),
});

casesRouter.post("/:id/approve", async (req, res, next) => {
  try {
    const body = approveSchema.parse(req.body);
    const caseId = req.params.id;
    const approval = await prisma.approvalRequest.findFirst({ where: { caseId, status: "PENDING" }, orderBy: { requestedAt: "desc" } });
    if (!approval) return res.status(409).json({ error: "no pending approval request for this case" });

    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { status: body.approve ? "APPROVED" : "REJECTED", decidedAt: new Date(), decidedBy: body.decidedBy, notes: body.notes },
    });
    await writeAudit({
      caseId,
      entityType: "APPROVAL",
      entityId: approval.id,
      eventType: body.approve ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
      actor: `human:${body.decidedBy}`,
      action: body.approve ? `Approved for execution${body.notes ? `: ${body.notes}` : ""}` : `Rejected${body.notes ? `: ${body.notes}` : ""}`,
    });

    if (!body.approve) {
      await prisma.revenueRiskCase.update({ where: { id: caseId }, data: { status: "STOPPED" } });
      return res.json({ status: "STOPPED", reason: "rejected by human approver" });
    }

    const latestDecision = await prisma.agentDecision.findFirst({ where: { caseId }, orderBy: { createdAt: "desc" } });
    if (!latestDecision) return res.status(409).json({ error: "no agent decision found to execute" });

    const result = await executeApprovedStrategy(
      caseId,
      latestDecision.recommendedStrategyCode as any,
      latestDecision.maxAttempts,
      latestDecision.cooldownHours,
      latestDecision.expectedRecoveryProbability,
      `human:${body.decidedBy}`,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});
