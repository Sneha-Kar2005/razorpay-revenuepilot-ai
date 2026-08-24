# RevenuePilot AI — Pitch Script (target 5:00)

Narration recorded with Windows SAPI (System.Speech) text-to-speech — see
README in this folder for exactly what was used and why. Word counts are
sized to ~2.3 words/second spoken pace per segment.

## 1. The Problem — 0:00–0:30 (slide)

Every payments merchant leaks revenue quietly. A card gets declined. A
checkout gets abandoned halfway. An invoice goes overdue and nobody follows
up. None of it looks urgent on its own — which is exactly why it adds up to
real, measurable money left on the table, every single day.

## 2. The Idea — 0:30–1:00 (slide)

This is RevenuePilot AI — a bounded revenue recovery agent for Razorpay
merchants, built for the AI Builder Internship, Track 3: AI Revenue
Recovery. It finds revenue at risk, figures out why it's at risk, chooses a
compliant way to win it back, and proves — with a full audit trail — exactly
how much it actually recovered.

## 3. How It Works — 1:00–1:45 (slide)

The agent runs one loop on every case: Detect, Diagnose, Decide, Act,
Verify. Detection is deterministic code reading real payment and invoice
data. Diagnosis is an AI step — Claude, or a rule-based simulator when no
key is configured — but it only ever recommends. A separate, deterministic
policy engine decides what's actually allowed: retry caps, cooldowns,
opt-outs, suspicious transactions, and approval thresholds for high-value
cases. Only after that gate does a bounded executor act — and every step
writes an audit event.

## 4. Live Product Demo — 1:45–3:15 (screen recording, app)

Here's the real dashboard. Total revenue at risk, recovered revenue,
recovery rate — all computed from an actual batch of cases, not made up.
Let's open one case — four thousand nine hundred ninety nine rupees at
risk. I'll run the recovery cycle. The agent diagnoses the root cause,
recommends a strategy, and the policy engine evaluates it against the
bounded rules. It's allowed — no approval needed — so the executor acts.
And there it is: the case is recovered, the amount is logged, and the full
timeline — diagnosis, policy decision, action, outcome — is sitting right
here in the audit trail.

## 5. Failure & Safety Demo — 3:15–4:00 (screen recording, app)

Now the part most demos skip: what happens when something fails, and when
a case needs a human. This case hit a simulated upstream API error — a
gateway timeout, not a customer decline, our own channel failing. The
system doesn't retry blindly. It logs the failure and applies a bounded,
backed-off retry instead of hammering the API. And for cases above our
auto-recovery threshold, like this seventy five thousand rupee case, the
agent stops and waits for a human. I approve it, and only then does it
execute. Every one of those decisions is right here in the audit trail, in
order.

## 6. Measured Impact — 4:00–4:35 (screen recording, app)

And here's the batch-level proof the track actually asks for. Across a
hundred and twenty seeded cases: total revenue at risk, revenue actually
recovered, the recovery rate, and strategy performance broken down by
approach — smart retry, payment links, reminders, escalation. These are
real numbers from a real run of this system, not a cherry-picked case.

## 7. Why Razorpay — 4:35–5:00 (slide)

RevenuePilot AI integrates with real Razorpay Payment Links, Orders, and
signature-verified webhooks in test mode — built to activate the moment
real credentials are supplied. Razorpay already owns the payment failure.
This agent owns what happens next: bounded, audited, and built to turn
that failure into recovered revenue. Thank you.
