import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatINR, formatPercent, formatDate, titleCase } from "../lib/format";
import { StatusBadge } from "../components/StatusBadge";
import { LoadingState, ErrorState } from "../components/LoadingState";
import { useToast } from "../components/Toast";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm border-b border-border-soft last:border-0">
      <span className="text-text-faint">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

export function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const { data: c, isLoading, error } = useQuery({ queryKey: ["case", id], queryFn: () => api.caseDetail(id!), enabled: !!id });

  if (isLoading) return <LoadingState label="Loading case…" />;
  if (error || !c) return <ErrorState message={(error as Error)?.message ?? "case not found"} />;

  const latestDecision = c.agentDecisions[c.agentDecisions.length - 1];
  const pendingApproval = c.approvalRequests.find((a) => a.status === "PENDING");
  const canRun = ["DETECTED", "DIAGNOSED", "STRATEGY_SELECTED"].includes(c.status);

  async function runCycle() {
    setBusy(true);
    try {
      const result = await api.runCase(id!);
      toast.push(`Cycle result: ${titleCase(result.status)}${result.reason ? ` — ${result.reason}` : ""}`, "success");
      qc.invalidateQueries({ queryKey: ["case", id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    } catch (err) {
      toast.push(`Run failed: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const result = await api.approveCase(id!, approve);
      toast.push(approve ? `Approved — result: ${titleCase(result.status)}` : "Case rejected and stopped", approve ? "success" : "info");
      qc.invalidateQueries({ queryKey: ["case", id] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    } catch (err) {
      toast.push(`Action failed: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      <div>
        <Link to="/queue" className="text-xs text-accent-strong hover:underline">
          ← Back to risk queue
        </Link>
        <div className="flex items-start justify-between gap-4 mt-2 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{c.customer.name}</h1>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-sm text-text-muted mt-1">
              {titleCase(c.sourceType)} · {c.customer.segment} customer · case {c.id.slice(-8)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pendingApproval && (
              <>
                <button onClick={() => decide(true)} disabled={busy} className="rounded-lg bg-success text-black font-semibold text-sm px-4 py-2 disabled:opacity-50">
                  Approve
                </button>
                <button onClick={() => decide(false)} disabled={busy} className="rounded-lg border border-danger text-danger font-semibold text-sm px-4 py-2 disabled:opacity-50">
                  Reject
                </button>
              </>
            )}
            {canRun && !pendingApproval && (
              <button onClick={runCycle} disabled={busy} className="rounded-lg bg-accent hover:bg-accent-strong text-white font-semibold text-sm px-4 py-2 disabled:opacity-50">
                {busy ? "Running…" : "Run Recovery Cycle"}
              </button>
            )}
          </div>
        </div>
      </div>

      {pendingApproval && (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm">
          <span className="font-semibold text-warning">Human approval required.</span>{" "}
          <span className="text-text-muted">{pendingApproval.reason}</span>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        <Section title="Case Summary">
          <KV k="Amount at risk" v={formatINR(c.amountAtRiskPaise)} />
          <KV k="Recovered so far" v={formatINR(c.recoveredAmountPaise)} />
          <KV k="Risk category" v={titleCase(c.riskCategory)} />
          <KV k="Priority score" v={c.priorityScore.toFixed(1)} />
          <KV k="Attempts" v={`${c.attemptsMade} / ${c.maxAttempts}`} />
          <KV k="Detected" v={formatDate(c.detectedAt)} />
          <KV k="Customer LTV" v={formatINR(c.customer.lifetimeValuePaise)} />
          <KV k="Opted out?" v={c.customer.optedOutOfContact ? "Yes" : "No"} />
        </Section>

        <Section title="AI Diagnosis">
          {latestDecision ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-faint">Root cause</span>
                <span className="text-sm font-semibold">{titleCase(latestDecision.rootCause)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-faint">Confidence</span>
                <span className="text-sm font-semibold">{formatPercent(latestDecision.confidence)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-faint">Provider</span>
                <span className="text-sm font-semibold">{latestDecision.provider === "claude" ? `Claude (${latestDecision.modelId})` : "Simulated AI"}</span>
              </div>
              <div>
                <span className="text-xs text-text-faint block mb-1">Signals</span>
                <ul className="text-xs text-text-muted list-disc list-inside space-y-0.5 break-all">
                  {(JSON.parse(latestDecision.signals) as string[]).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="text-xs text-text-faint block mb-1">Recommended strategy</span>
                <p className="text-sm font-semibold text-accent-strong">{titleCase(latestDecision.recommendedStrategyCode)}</p>
                <p className="text-xs text-text-muted mt-1">{latestDecision.recommendedReason}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-faint">No diagnosis yet — run a recovery cycle.</p>
          )}
        </Section>

        <Section title="Policy Decision">
          {c.policyDecisions.length ? (
            (() => {
              const p = c.policyDecisions[c.policyDecisions.length - 1];
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-faint">Allowed</span>
                    <span className={`text-sm font-semibold ${p.allowed ? "text-success" : "text-danger"}`}>{p.allowed ? "Yes" : "No"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-faint">Requires approval</span>
                    <span className="text-sm font-semibold">{p.requiresApproval ? "Yes" : "No"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-text-faint block mb-1">Reason codes</span>
                    <ul className="text-xs text-text-muted list-disc list-inside space-y-0.5 break-all">
                      {(JSON.parse(p.reasonCodes) as string[]).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-xs text-text-faint block mb-1">Applied rules</span>
                    <div className="flex flex-wrap gap-1">
                      {(JSON.parse(p.appliedRules) as string[]).map((r) => (
                        <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-faint font-mono">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <p className="text-sm text-text-faint">No policy evaluation yet.</p>
          )}
        </Section>
      </div>

      <Section title="Recovery Actions">
        {c.actions.length ? (
          <div className="space-y-3">
            {c.actions.map((a) => (
              <div key={a.id} className="rounded-lg border border-border-soft p-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{a.strategy.name}</span>
                    <StatusBadge status={a.status} />
                    <span className="text-xs text-text-faint">attempt {a.attemptNumber}</span>
                  </div>
                  <p className="text-xs text-text-muted mt-1">{a.resultSummary ?? "In progress…"}</p>
                  <p className="text-[11px] text-text-faint mt-1">via {a.channel} · {formatDate(a.createdAt)}</p>
                </div>
                {a.recoveredAmountPaise ? <span className="text-sm font-semibold text-success shrink-0">{formatINR(a.recoveredAmountPaise)}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-faint">No actions executed yet.</p>
        )}
      </Section>

      <Section title="Recovery Timeline & Audit Trail">
        <ol className="relative border-l border-border ml-2 space-y-5">
          {c.auditEvents.map((e) => (
            <li key={e.id} className="ml-4">
              <div className="absolute w-2 h-2 rounded-full bg-accent -left-[4.5px] mt-1.5" />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono text-text-faint">{formatDate(e.createdAt)}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-faint">{e.entityType}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent-strong font-mono">{e.eventType}</span>
                <span className="text-[10px] text-text-faint">by {e.actor}</span>
              </div>
              <p className="text-sm mt-1">{e.action}</p>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
