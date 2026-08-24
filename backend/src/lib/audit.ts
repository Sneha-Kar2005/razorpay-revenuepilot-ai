import { prisma } from "../db/prisma.js";

export interface AuditInput {
  caseId?: string;
  entityType: "CASE" | "PAYMENT" | "ACTION" | "POLICY" | "WEBHOOK" | "APPROVAL" | "SYSTEM";
  entityId: string;
  eventType: string;
  actor: string;
  action: string;
  previousState?: unknown;
  newState?: unknown;
  aiRecommendation?: unknown;
  policyDecision?: unknown;
  executionResult?: unknown;
  amountPaise?: number;
}

/**
 * Every meaningful state change in the system writes exactly one audit
 * event here. Rows are never updated or deleted, only appended, so the
 * table itself is the append-only audit trail shown in the UI.
 */
export async function writeAudit(input: AuditInput) {
  return prisma.auditEvent.create({
    data: {
      caseId: input.caseId,
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      actor: input.actor,
      action: input.action,
      previousState: input.previousState !== undefined ? JSON.stringify(input.previousState) : null,
      newState: input.newState !== undefined ? JSON.stringify(input.newState) : null,
      aiRecommendation: input.aiRecommendation !== undefined ? JSON.stringify(input.aiRecommendation) : null,
      policyDecision: input.policyDecision !== undefined ? JSON.stringify(input.policyDecision) : null,
      executionResult: input.executionResult !== undefined ? JSON.stringify(input.executionResult) : null,
      amountPaise: input.amountPaise,
    },
  });
}
