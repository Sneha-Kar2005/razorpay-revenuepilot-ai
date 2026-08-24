# Architecture

## System overview

RevenuePilot AI is a conventional three-tier web app (React SPA → Express REST API → SQLite via Prisma) with one added component: a bounded agent pipeline that turns a detected revenue-risk case into a recovery action. See the top-level diagram in the [README](../README.md#architecture).

The design principle that shapes every module boundary: **the AI recommends, deterministic code decides and acts.** Nothing the LLM (or its simulated stand-in) returns is trusted directly — it is schema-validated, then re-evaluated by a separate policy engine that can only ever be *more* restrictive than what the AI proposed, never less.

## Data model

```mermaid
erDiagram
    Merchant ||--o{ Customer : has
    Merchant ||--o{ Payment : has
    Merchant ||--o{ Receivable : has
    Merchant ||--o{ RevenueRiskCase : has
    Customer ||--o{ Payment : makes
    Customer ||--o{ Receivable : owes
    Customer ||--o{ RevenueRiskCase : "is subject of"
    Payment ||--o{ PaymentAttempt : has
    Payment ||--o| RevenueRiskCase : "may trigger"
    Receivable ||--o| RevenueRiskCase : "may trigger"
    RevenueRiskCase ||--o{ AgentDecision : has
    RevenueRiskCase ||--o{ PolicyDecision : has
    RevenueRiskCase ||--o{ RecoveryAction : has
    RevenueRiskCase ||--o{ RecoveryOutcome : has
    RevenueRiskCase ||--o{ ApprovalRequest : has
    RevenueRiskCase ||--o{ AuditEvent : has
    RecoveryStrategy ||--o{ RecoveryAction : "used by"
    RecoveryAction ||--o{ RecoveryOutcome : produces

    RevenueRiskCase {
        string sourceType
        int amountAtRiskPaise
        string riskCategory
        float priorityScore
        string status
        int attemptsMade
        int maxAttempts
        int recoveredAmountPaise
    }
    AgentDecision {
        string provider
        string rootCause
        float confidence
        string recommendedStrategyCode
        float expectedRecoveryProbability
        int expectedRecoveredAmountPaise
    }
    PolicyDecision {
        bool allowed
        bool requiresApproval
        string reasonCodes
        string appliedRules
    }
    RecoveryAction {
        string status
        string channel
        string idempotencyKey
        int recoveredAmountPaise
    }
    AuditEvent {
        string entityType
        string eventType
        string actor
        string action
    }
```

Full field-level definitions: [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma).

## Agent cycle sequence

```mermaid
sequenceDiagram
    participant Trigger as Trigger (demo batch / manual / webhook)
    participant Exec as runRecoveryCycle()
    participant Ctx as Context Builder
    participant AI as AI Agent (Claude or Simulated)
    participant Policy as Policy Engine
    participant Bounded as Bounded Executor
    participant Channel as Recovery Channel
    participant Audit as Audit Trail

    Trigger->>Exec: run(caseId)
    Exec->>Exec: check terminal / cooldown / awaiting-approval
    Exec->>Ctx: buildCaseContext(caseId)
    Ctx-->>Exec: CaseContext (amounts, segment, opt-out, prior attempts...)
    Exec->>AI: runAgent(context)
    AI-->>Exec: AgentDecisionOutput (Zod-validated)
    Exec->>Audit: AI_DIAGNOSIS event
    Exec->>Policy: evaluatePolicy(context, decision)
    Policy-->>Exec: {allowed, requiresApproval, reasonCodes, boundedMaxAttempts, boundedCooldownHours}
    Exec->>Audit: POLICY_EVALUATED event
    alt not allowed
        Exec->>Audit: CASE_STOPPED event
    else requires approval
        Exec->>Audit: APPROVAL_REQUESTED event
        Note over Exec: case waits in AWAITING_APPROVAL<br/>until a human calls /approve
    else allowed
        Exec->>Bounded: executeApprovedStrategy(...)
        Bounded->>Bounded: create RecoveryAction (idempotencyKey unique)
        Bounded->>Audit: ACTION_STARTED event
        Bounded->>Channel: execute (real Razorpay link or simulator)
        alt channel API throws
            Channel-->>Bounded: error
            Bounded->>Audit: ACTION_API_FAILURE event
            Bounded->>Bounded: schedule bounded retry OR escalate
        else success
            Channel-->>Bounded: recoveredAmountPaise
            Bounded->>Audit: CASE_RECOVERED event
        else no recovery
            Channel-->>Bounded: customer did not pay
            Bounded->>Bounded: schedule retry OR mark FAILED
        end
    end
```

## Webhook ingestion flow

```mermaid
sequenceDiagram
    participant RZP as Razorpay
    participant EP as POST /webhooks/razorpay
    participant Sig as verifyWebhookSignature()
    participant DB as WebhookEvent table
    participant Resolver as resolveActionFromWebhook()

    RZP->>EP: POST (raw JSON body, X-Razorpay-Signature header)
    EP->>Sig: HMAC-SHA256(rawBody, secret) == header?
    alt invalid signature
        Sig-->>EP: false
        EP-->>RZP: 401 + audit WEBHOOK_SIGNATURE_INVALID
    else valid
        Sig-->>EP: true
        EP->>DB: razorpayEventId already seen?
        alt duplicate delivery
            DB-->>EP: yes
            EP-->>RZP: 200 {deduped: true} (no side effects)
        else new event
            DB-->>EP: no
            EP->>DB: insert WebhookEvent
            EP->>Resolver: handle payment_link.paid / payment.captured / payment.failed
            Resolver->>Resolver: only act if action not already SUCCEEDED/FAILED
            Resolver-->>EP: case + action updated, audit written
            EP-->>RZP: 200 {ok: true}
        end
    end
```

A local simulator (`POST /webhooks/razorpay/simulate`, disabled in production) builds a real HMAC signature and runs the identical pipeline, so the ingestion logic is exercised without a public HTTPS tunnel.

## Failure handling

Section 15/16 of the brief requires a visible, gracefully-handled failure. This is implemented, not merely described:

- In DEMO mode, `simulateChannelExecution()` ([`backend/src/razorpay/demoSimulator.ts`](../backend/src/razorpay/demoSimulator.ts)) deterministically (seeded by `caseId:attemptNumber:strategy`) returns an `API_ERROR` outcome for ~6% of executions — modelling a gateway timeout independent of customer behaviour, so this path is always present in a demo batch, not cherry-picked.
- In RAZORPAY_TEST mode, any thrown error from the real `paymentLink.create()` call takes the identical path.
- `handleApiFailure()` in [`executor.ts`](../backend/src/strategy/executor.ts):
  1. Marks the `RecoveryAction` `FAILED` with a `failureCode`, writes an `ACTION_API_FAILURE` audit event.
  2. If attempts remain, schedules a bounded retry with **exponential backoff** (`cooldownHours * 2^(attemptNumber-1)`), moves the case back to `STRATEGY_SELECTED`.
  3. If attempts are exhausted, creates an `ApprovalRequest`, moves the case to `ESCALATED`, writes an audit event — a human takes it from there.
- Distinguishing this from an ordinary "customer didn't pay" outcome matters for metrics: `badInterventionRate` (Analytics) counts only *our own* channel failures, not normal customer non-response, which is tracked separately as `customerNoResponseRate`.

## Idempotency & safety

- **Duplicate action protection**: `RecoveryAction.idempotencyKey` (`caseId:strategyCode:attemptNumber`) is a DB-unique constraint. Two concurrent triggers for the same attempt race to insert; the loser catches a Prisma `P2002` and returns a "duplicate suppressed" result instead of creating a second action. Verified by an automated concurrency test (`backend/src/__tests__/executorIdempotency.test.ts`).
- **Duplicate webhook protection**: `WebhookEvent.razorpayEventId` unique constraint — Razorpay's documented retry-on-non-2xx redelivery is a no-op.
- **Cooldown / eligibility gating**: `RevenueRiskCase.nextEligibleAt` prevents a case from being re-processed before its bounded cooldown elapses, checked at the top of every cycle.
- **State machine**: case `status` only moves through the documented set (`DETECTED → DIAGNOSED → STRATEGY_SELECTED/AWAITING_APPROVAL → ACTION_IN_PROGRESS → RECOVERED/PARTIALLY_RECOVERED/FAILED/ESCALATED/STOPPED`) — terminal statuses (`RECOVERED`, `STOPPED`, `ESCALATED`) are checked and short-circuit any further cycle.
- **Money safety**: every amount is an integer count of paise from creation to display; `backend/src/lib/money.ts` is the only place arithmetic on money happens, and it is covered by unit tests.

## Security model

- Secrets only ever come from environment variables (`backend/src/lib/env.ts`); `.env` is git-ignored, `.env.example` documents every variable with no real values.
- `helmet()` sets standard security headers; `cors()` is restricted to the configured frontend origin; `express-rate-limit` caps request volume per IP.
- Webhook signature verification uses `crypto.timingSafeEqual` (not `===`) to avoid timing side-channels.
- All request inputs are parsed and validated with Zod before touching the database (`backend/src/routes/*.ts`).
- Error responses never leak internal error messages/stack traces when `NODE_ENV=production` (`backend/src/middleware/errorHandler.ts`).
