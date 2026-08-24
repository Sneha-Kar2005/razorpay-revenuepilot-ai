import { Router } from "express";
import { dataMode, aiLiveConfigured, razorpayLiveConfigured, env } from "../lib/env.js";

export const metaRouter = Router();

metaRouter.get("/", (_req, res) => {
  res.json({
    product: "RevenuePilot AI",
    track: "Razorpay AI Builder Internship 2026 - Track 03: AI Revenue Recovery",
    dataMode, // RAZORPAY_TEST | DEMO
    razorpayLiveConfigured,
    aiLiveConfigured,
    aiProviderLabel: aiLiveConfigured ? `Claude (${env.anthropicModel}) - Live` : "Simulated AI (no API key configured)",
    policy: {
      maxRetries: env.policyMaxRetries,
      minCooldownHours: env.policyMinCooldownHours,
      maxAutoRecoveryPaise: env.policyMaxAutoRecoveryPaise,
      approvalThresholdPaise: env.policyApprovalThresholdPaise,
    },
  });
});
