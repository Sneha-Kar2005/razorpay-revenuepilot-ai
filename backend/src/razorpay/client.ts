import Razorpay from "razorpay";
import { env, razorpayLiveConfigured } from "../lib/env.js";

let instance: Razorpay | null = null;

/** Real Razorpay Node SDK client, only constructed when TEST-mode keys are configured. */
export function getRazorpayClient(): Razorpay {
  if (!razorpayLiveConfigured) {
    throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing) - running in DEMO mode");
  }
  if (!instance) {
    instance = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  }
  return instance;
}

export interface RecoveryLinkResult {
  id: string;
  shortUrl: string;
  status: string;
}

/**
 * Creates a real Razorpay Payment Link in TEST mode. This is the actual
 * outbound recovery mechanism used for PAYMENT_LINK / ALT_METHOD / retry
 * strategies: merchants cannot silently re-charge a customer's saved card
 * without a mandate, so the correct, compliant "retry" is a fresh
 * Razorpay-hosted payment link the customer completes themselves.
 */
export async function createRecoveryPaymentLink(params: {
  amountPaise: number;
  description: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  referenceId: string;
  expireByEpochSeconds: number;
}): Promise<RecoveryLinkResult> {
  const client = getRazorpayClient();
  const link = await client.paymentLink.create({
    amount: params.amountPaise,
    currency: "INR",
    description: params.description,
    customer: {
      name: params.customerName,
      email: params.customerEmail,
      contact: params.customerPhone,
    },
    notify: { sms: true, email: true },
    reminder_enable: true,
    reference_id: params.referenceId,
    expire_by: params.expireByEpochSeconds,
  });
  return { id: link.id, shortUrl: link.short_url, status: link.status };
}

export async function fetchPaymentLinkStatus(paymentLinkId: string) {
  const client = getRazorpayClient();
  return client.paymentLink.fetch(paymentLinkId);
}

export async function fetchPayment(paymentId: string) {
  const client = getRazorpayClient();
  return client.payments.fetch(paymentId);
}

export async function createOrder(params: { amountPaise: number; receipt: string; notes?: Record<string, string> }) {
  const client = getRazorpayClient();
  return client.orders.create({
    amount: params.amountPaise,
    currency: "INR",
    receipt: params.receipt,
    notes: params.notes,
  });
}
