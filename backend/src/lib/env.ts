import "dotenv/config";

function num(v: string | undefined, fallback: number): number {
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: num(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",

  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? "",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",

  policyMaxRetries: num(process.env.POLICY_MAX_RETRIES, 2),
  policyMinCooldownHours: num(process.env.POLICY_MIN_COOLDOWN_HOURS, 4),
  policyMaxAutoRecoveryPaise: num(process.env.POLICY_MAX_AUTO_RECOVERY_PAISE, 5_000_000),
  policyApprovalThresholdPaise: num(process.env.POLICY_APPROVAL_THRESHOLD_PAISE, 5_000_000),

  demoSeed: process.env.DEMO_SEED ?? "revenuepilot-2026",
  demoCaseCount: num(process.env.DEMO_CASE_COUNT, 120),
} as const;

/** True when real Razorpay TEST-mode credentials are configured. */
export const razorpayLiveConfigured =
  env.razorpayKeyId.length > 0 && env.razorpayKeySecret.length > 0;

/** True when a real Anthropic API key is configured. */
export const aiLiveConfigured = env.anthropicApiKey.length > 0;

export const dataMode: "RAZORPAY_TEST" | "DEMO" = razorpayLiveConfigured ? "RAZORPAY_TEST" : "DEMO";
