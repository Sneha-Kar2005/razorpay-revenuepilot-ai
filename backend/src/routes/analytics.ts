import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { sumPaise, ratio } from "../lib/money.js";

export const analyticsRouter = Router();

const STOPPED_LIKE = new Set(["STOPPED"]);
const RECOVERED_LIKE = new Set(["RECOVERED", "PARTIALLY_RECOVERED"]);

analyticsRouter.get("/", async (_req, res, next) => {
  try {
    const [cases, outcomes, actions] = await Promise.all([
      prisma.revenueRiskCase.findMany({ include: { customer: true } }),
      prisma.recoveryOutcome.findMany(),
      prisma.recoveryAction.findMany({ include: { strategy: true } }),
    ]);

    const totalAtRiskPaise = sumPaise(cases.map((c) => c.amountAtRiskPaise));
    const eligibleCases = cases.filter((c) => !STOPPED_LIKE.has(c.status));
    const eligibleRecoveryPaise = sumPaise(eligibleCases.map((c) => c.amountAtRiskPaise));
    const attemptedCases = cases.filter((c) => c.attemptsMade > 0);
    const attemptedRecoveryPaise = sumPaise(attemptedCases.map((c) => c.amountAtRiskPaise));
    const recoveredCases = cases.filter((c) => RECOVERED_LIKE.has(c.status));
    const recoveredRevenuePaise = sumPaise(cases.map((c) => c.recoveredAmountPaise));
    const recoveryCostPaise = sumPaise(outcomes.map((o) => o.recoveryCostPaise));
    const netRecoveredRevenuePaise = recoveredRevenuePaise - recoveryCostPaise;

    const successOutcomes = outcomes.filter((o) => o.outcome === "SUCCESS" && o.timeToRecoverySeconds != null);
    const avgRecoveryTimeSeconds = successOutcomes.length
      ? Math.round(successOutcomes.reduce((s, o) => s + (o.timeToRecoverySeconds ?? 0), 0) / successOutcomes.length)
      : 0;

    const escalatedCases = cases.filter((c) => c.status === "ESCALATED");
    const stoppedCases = cases.filter((c) => c.status === "STOPPED");
    // "Bad intervention" = the system's own channel/API call failed (our
    // fault - e.g. a gateway timeout), NOT a customer simply declining to
    // pay (an expected, non-faulty outcome). Distinguishing these matters:
    // a high customer-no-response rate is normal, a high API-failure rate
    // is a system reliability problem.
    const badInterventionActions = actions.filter((a) => a.status === "FAILED" && a.failureCode && a.failureCode !== "NO_RECOVERY");

    const byStrategy: Record<string, { attempts: number; successes: number; recoveredPaise: number; code: string; name: string }> = {};
    for (const a of actions) {
      const key = a.strategy.code;
      byStrategy[key] ??= { attempts: 0, successes: 0, recoveredPaise: 0, code: a.strategy.code, name: a.strategy.name };
      byStrategy[key].attempts += 1;
      if (a.status === "SUCCEEDED") {
        byStrategy[key].successes += 1;
        byStrategy[key].recoveredPaise += a.recoveredAmountPaise ?? 0;
      }
    }
    const strategyPerformance = Object.values(byStrategy).map((s) => ({
      ...s,
      successRate: ratio(s.successes, s.attempts),
      avgRecoveredPaise: s.successes ? Math.round(s.recoveredPaise / s.successes) : 0,
    }));

    const byFailureType: Record<string, { total: number; recovered: number; amountAtRiskPaise: number; recoveredPaise: number }> = {};
    for (const c of cases) {
      const key = c.riskCategory;
      byFailureType[key] ??= { total: 0, recovered: 0, amountAtRiskPaise: 0, recoveredPaise: 0 };
      byFailureType[key].total += 1;
      byFailureType[key].amountAtRiskPaise += c.amountAtRiskPaise;
      byFailureType[key].recoveredPaise += c.recoveredAmountPaise;
      if (RECOVERED_LIKE.has(c.status)) byFailureType[key].recovered += 1;
    }
    const failureTypeBreakdown = Object.entries(byFailureType).map(([riskCategory, v]) => ({
      riskCategory,
      ...v,
      recoveryRate: ratio(v.recovered, v.total),
    }));

    const bySegment: Record<string, { total: number; amountAtRiskPaise: number; recoveredPaise: number }> = {};
    for (const c of cases) {
      const key = c.customer.segment;
      bySegment[key] ??= { total: 0, amountAtRiskPaise: 0, recoveredPaise: 0 };
      bySegment[key].total += 1;
      bySegment[key].amountAtRiskPaise += c.amountAtRiskPaise;
      bySegment[key].recoveredPaise += c.recoveredAmountPaise;
    }

    res.json({
      totals: {
        totalAtRiskPaise,
        eligibleRecoveryPaise,
        attemptedRecoveryPaise,
        recoveredRevenuePaise,
        recoveryCostPaise,
        netRecoveredRevenuePaise,
        recoveryRate: ratio(recoveredRevenuePaise, eligibleRecoveryPaise),
        avgRecoveryTimeSeconds,
        caseCount: cases.length,
        recoveredCaseCount: recoveredCases.length,
        escalationRate: ratio(escalatedCases.length, cases.length),
        stoppedRate: ratio(stoppedCases.length, cases.length),
        badInterventionRate: ratio(badInterventionActions.length, actions.length || 1),
        customerNoResponseRate: ratio(actions.filter((a) => a.failureCode === "NO_RECOVERY").length, actions.length || 1),
        totalActions: actions.length,
      },
      strategyPerformance,
      failureTypeBreakdown,
      segmentBreakdown: Object.entries(bySegment).map(([segment, v]) => ({ segment, ...v })),
      statusBreakdown: Object.entries(
        cases.reduce<Record<string, number>>((acc, c) => {
          acc[c.status] = (acc[c.status] ?? 0) + 1;
          return acc;
        }, {}),
      ).map(([status, count]) => ({ status, count })),
    });
  } catch (err) {
    next(err);
  }
});
