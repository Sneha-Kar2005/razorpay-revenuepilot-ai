# API reference

Base URL (local dev): `http://localhost:4000/api` (the frontend dev server proxies `/api` here — see `frontend/vite.config.ts`).

All responses are JSON. All money fields are integer **paise**. Validation errors return `400 { error: "validation_error", details: [...] }` (Zod issues). Unhandled errors return `500 { error: "internal_error" }`.

## `GET /api/health`

Liveness check. `{ ok: true, service, time }`.

## `GET /api/meta`

Current data mode, AI provider, and active policy thresholds — powers the top banner and Settings page.

```json
{
  "product": "RevenuePilot AI",
  "dataMode": "DEMO",
  "razorpayLiveConfigured": false,
  "aiLiveConfigured": false,
  "aiProviderLabel": "Simulated AI (no API key configured)",
  "policy": { "maxRetries": 2, "minCooldownHours": 4, "maxAutoRecoveryPaise": 5000000, "approvalThresholdPaise": 5000000 }
}
```

## `GET /api/recovery/cases`

List revenue-risk cases. Query params (all optional): `status`, `sourceType`, `riskCategory`, `segment`, `minAmountPaise`, `maxAmountPaise`, `recovered` (`true`/`false`), `search` (customer name), `page`, `pageSize` (max 200).

Returns `{ total, page, pageSize, cases: RiskCase[] }`, ordered by priority score then recency.

## `GET /api/recovery/cases/:id`

Full case detail: customer, payment/receivable, all `AgentDecision`s, `PolicyDecision`s, `RecoveryAction`s (with outcomes), `ApprovalRequest`s, and the complete `AuditEvent` timeline for this case.

## `POST /api/recovery/cases/:id/run`

Runs one full DETECT→DIAGNOSE→POLICY→ACT→VERIFY cycle for this case. Safe to call repeatedly — a case already terminal, in cooldown, or awaiting approval returns `{ status: "SKIPPED", reason }` without side effects.

Response: `{ status, reason?, caseId }` where `status` is one of `SKIPPED | STOPPED | AWAITING_APPROVAL | IN_PROGRESS | RECOVERED | PARTIALLY_RECOVERED | FAILED | API_ERROR_RETRY_SCHEDULED | ESCALATED`.

## `POST /api/recovery/cases/:id/approve`

Body: `{ "approve": true | false, "notes"?: string, "decidedBy"?: string }`.

Resolves the case's pending `ApprovalRequest`. `approve: true` immediately executes the previously-recommended strategy (subject to the same bounded executor); `approve: false` stops the case. Returns `409` if there is no pending approval request.

## `GET /api/analytics`

Aggregate metrics across every case — see the README's [Metrics](../README.md#metrics) section for definitions. Includes `totals`, `strategyPerformance[]`, `failureTypeBreakdown[]`, `segmentBreakdown[]`, `statusBreakdown[]`.

## `GET /api/audit`

Paginated, filterable audit log. Query params: `caseId`, `entityType` (`CASE|PAYMENT|ACTION|POLICY|WEBHOOK|APPROVAL|SYSTEM`), `page`, `pageSize`.

## `POST /api/demo/run`

Body: `{ "limit"?: number }` (default: all eligible, max 500). Batch-runs `runRecoveryCycle` over every case currently eligible for a cycle. This is the "one-click demo simulation" — real DB writes, not a UI animation. Returns `{ processed, summary: Record<status, count>, results: CycleResult[] }`.

## `POST /api/demo/reset`

Re-seeds the deterministic synthetic dataset (`DEMO_SEED` / `DEMO_CASE_COUNT` env vars), discarding all prior demo case/decision/action/audit history for the demo merchant. Returns `{ ok, merchantId, customerCount, caseCount }`.

## `GET /api/demo/status`

`{ dataMode, aiLiveConfigured }` — lightweight version of `/api/meta` for polling.

## `POST /webhooks/razorpay`

Real Razorpay webhook receiver. Requires a valid `X-Razorpay-Signature` header (HMAC-SHA256 over the raw body, keyed with `RAZORPAY_WEBHOOK_SECRET`). Handles `payment_link.paid`, `payment.captured`, `payment.failed`, `order.paid`. Idempotent on `X-Razorpay-Event-Id`.

Configure in the Razorpay Dashboard under **Webhooks**, pointing at `https://<your-host>/webhooks/razorpay`, selecting the events above.

## `POST /webhooks/razorpay/simulate`

Development-only (`NODE_ENV !== "production"`). Accepts a plain JSON body shaped like a Razorpay webhook payload, builds a real HMAC signature, and runs it through the identical verification + handling pipeline as the real endpoint — for local testing without a public HTTPS tunnel.

Example:

```bash
curl -X POST http://localhost:4000/webhooks/razorpay/simulate \
  -H "Content-Type: application/json" \
  -d '{
    "event": "payment_link.paid",
    "payload": { "payment_link": { "entity": { "reference_id": "<a RecoveryAction id>", "amount_paid": 49900 } } }
  }'
```
