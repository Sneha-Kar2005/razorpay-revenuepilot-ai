import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

export const auditRouter = Router();

const querySchema = z.object({
  caseId: z.string().optional(),
  entityType: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(100),
});

auditRouter.get("/", async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const where: any = {};
    if (q.caseId) where.caseId = q.caseId;
    if (q.entityType) where.entityType = q.entityType;

    const [total, events] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    res.json({
      total,
      page: q.page,
      pageSize: q.pageSize,
      events: events.map((e) => ({
        ...e,
        previousState: e.previousState ? JSON.parse(e.previousState) : null,
        newState: e.newState ? JSON.parse(e.newState) : null,
        aiRecommendation: e.aiRecommendation ? JSON.parse(e.aiRecommendation) : null,
        policyDecision: e.policyDecision ? JSON.parse(e.policyDecision) : null,
        executionResult: e.executionResult ? JSON.parse(e.executionResult) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});
