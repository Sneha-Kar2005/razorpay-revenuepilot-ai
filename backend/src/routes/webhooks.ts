import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../db/prisma.js";
import { verifyWebhookSignature } from "../razorpay/signature.js";
import { writeAudit } from "../lib/audit.js";
import { env } from "../lib/env.js";

export const webhooksRouter = Router();

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: { entity?: Record<string, any> };
    payment_link?: { entity?: Record<string, any> };
  };
}

/**
 * Shared ingestion pipeline: verify signature -> dedupe -> persist ->
 * dispatch -> mark processed. Used by both the real endpoint and the local
 * simulator so they exercise identical logic (see routes below).
 */
async function processWebhook(rawBody: string, signatureHeader: string | undefined, eventIdHeader: string | undefined, secretOverride?: string) {
  const signatureValid = secretOverride
    ? verifyWithSecret(rawBody, signatureHeader, secretOverride)
    : verifyWebhookSignature(rawBody, signatureHeader);

  let parsed: RazorpayWebhookPayload;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid JSON body" } };
  }

  if (!signatureValid) {
    await writeAudit({
      entityType: "WEBHOOK",
      entityId: parsed.event ?? "unknown",
      eventType: "WEBHOOK_SIGNATURE_INVALID",
      actor: "razorpay_webhook",
      action: "Rejected webhook: signature verification failed",
    });
    return { status: 401, body: { error: "invalid signature" } };
  }

  const existing = eventIdHeader ? await prisma.webhookEvent.findUnique({ where: { razorpayEventId: eventIdHeader } }) : null;
  if (existing) {
    return { status: 200, body: { ok: true, deduped: true } };
  }

  const eventRow = await prisma.webhookEvent.create({
    data: { razorpayEventId: eventIdHeader, eventType: parsed.event, payload: rawBody, signatureValid: true },
  });

  await handleEvent(parsed);

  await prisma.webhookEvent.update({ where: { id: eventRow.id }, data: { processed: true, processedAt: new Date() } });
  return { status: 200, body: { ok: true } };
}

function verifyWithSecret(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Real Razorpay webhook ingestion endpoint. Mounted with express.raw() (see
 * server.ts) so req.body is the exact raw bytes needed for HMAC signature
 * verification per Razorpay's documented scheme (X-Razorpay-Signature =
 * HMAC-SHA256(rawBody, webhookSecret)).
 *
 * Idempotency: razorpayEventId has a unique DB constraint, so redelivery of
 * the same event (Razorpay retries on non-2xx / timeout) is a guaranteed
 * no-op rather than a duplicate recovery action.
 */
webhooksRouter.post("/razorpay", async (req, res, next) => {
  try {
    const rawBody = (req.body as Buffer).toString("utf8");
    const result = await processWebhook(rawBody, req.header("x-razorpay-signature"), req.header("x-razorpay-event-id"));
    res.status(result.status).json(result.body);
  } catch (err) {
    next(err);
  }
});

async function handleEvent(parsed: RazorpayWebhookPayload) {
  if (parsed.event === "payment_link.paid") {
    const entity = parsed.payload.payment_link?.entity;
    const referenceId = entity?.reference_id; // set to RecoveryAction.id when we create the link
    if (!referenceId) return;
    await resolveLinkedAction(referenceId, entity?.amount_paid ?? entity?.amount ?? 0, "SUCCESS");
  } else if (parsed.event === "payment.failed") {
    const entity = parsed.payload.payment?.entity;
    const referenceId = entity?.notes?.recovery_action_id;
    if (referenceId) await resolveLinkedAction(referenceId, 0, "FAILURE");
  } else if (parsed.event === "payment.captured" || parsed.event === "order.paid") {
    const entity = parsed.payload.payment?.entity;
    const referenceId = entity?.notes?.recovery_action_id;
    if (referenceId) await resolveLinkedAction(referenceId, entity?.amount ?? 0, "SUCCESS");
  }
}

async function resolveLinkedAction(actionId: string, amountPaise: number, outcome: "SUCCESS" | "FAILURE") {
  const action = await prisma.recoveryAction.findUnique({ where: { id: actionId } });
  if (!action || action.status === "SUCCEEDED" || action.status === "FAILED") return; // idempotent: already resolved

  const { resolveActionFromWebhook } = await import("../strategy/webhookResolver.js");
  await resolveActionFromWebhook(action.id, outcome, amountPaise);
}

/**
 * Local development / demo simulator for the webhook pipeline (section 17):
 * lets a developer exercise the full signature-verified ingestion path
 * without a public HTTPS tunnel. Disabled in production. Builds a genuine
 * HMAC-SHA256 signature over the JSON body (using RAZORPAY_WEBHOOK_SECRET
 * if configured, otherwise a fixed local demo secret) and runs it through
 * the exact same processWebhook() pipeline as the real endpoint.
 */
webhooksRouter.post("/razorpay/simulate", async (req, res, next) => {
  try {
    if (env.nodeEnv === "production") return res.status(403).json({ error: "simulator disabled in production" });
    const rawBody = JSON.stringify(req.body);
    const secret = env.razorpayWebhookSecret || "demo-webhook-secret";
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const eventId = `evt_sim_${Date.now()}_${Math.round(Math.random() * 1e6)}`;

    const result = await processWebhook(rawBody, signature, eventId, secret);
    res.status(result.status).json({ ...result.body, simulated: true });
  } catch (err) {
    next(err);
  }
});
