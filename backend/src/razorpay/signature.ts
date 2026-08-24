import crypto from "node:crypto";
import { env } from "../lib/env.js";

/**
 * Verifies X-Razorpay-Signature per Razorpay's documented scheme:
 * HMAC-SHA256 over the RAW request body, keyed with the webhook secret,
 * compared using a timing-safe comparison. The raw body must be captured
 * before any JSON parsing (see middleware/rawBody.ts).
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!env.razorpayWebhookSecret || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
