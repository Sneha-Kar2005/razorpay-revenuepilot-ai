import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { seedDemoData } from "../demo/seedData.js";
import { runRecoveryCycle } from "../strategy/executor.js";
import { dataMode, aiLiveConfigured } from "../lib/env.js";

export const demoRouter = Router();

const RUNNABLE_STATUSES = ["DETECTED", "DIAGNOSED", "STRATEGY_SELECTED"];

const runBodySchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
});

/**
 * One-click "Run Revenue Recovery Simulation": processes every case that is
 * currently eligible for a cycle (not terminal, not in cooldown) through
 * DIAGNOSE -> POLICY -> ACT -> VERIFY, batching real DB writes so the
 * dashboard, analytics and audit trail reflect real changed state, not a
 * UI-only animation.
 */
demoRouter.post("/run", async (req, res, next) => {
  try {
    const body = runBodySchema.parse(req.body ?? {});
    const eligible = await prisma.revenueRiskCase.findMany({
      where: {
        status: { in: RUNNABLE_STATUSES },
        OR: [{ nextEligibleAt: null }, { nextEligibleAt: { lte: new Date() } }],
      },
      select: { id: true },
      take: body.limit ?? 500,
      orderBy: { priorityScore: "desc" },
    });

    const results = [];
    for (const c of eligible) {
      const result = await runRecoveryCycle(c.id, "demo_batch_run");
      results.push(result);
    }

    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    res.json({ processed: results.length, summary, results });
  } catch (err) {
    next(err);
  }
});

/** Re-seeds deterministic synthetic demo data, discarding all prior demo case history. */
demoRouter.post("/reset", async (_req, res, next) => {
  try {
    const result = await seedDemoData();
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

demoRouter.get("/status", async (_req, res) => {
  res.json({ dataMode, aiLiveConfigured });
});
