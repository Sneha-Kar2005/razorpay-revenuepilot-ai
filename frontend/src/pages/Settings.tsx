import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatINR } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { LoadingState } from "../components/LoadingState";
import { useToast } from "../components/Toast";

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border-soft last:border-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className={`text-sm font-medium flex items-center gap-1.5 ${ok === false ? "text-warning" : ok === true ? "text-success" : ""}`}>
        {ok !== undefined && <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-success" : "bg-warning"}`} />}
        {value}
      </span>
    </div>
  );
}

export function Settings() {
  const { data: meta, isLoading } = useQuery({ queryKey: ["meta"], queryFn: api.meta });
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function resetDemo() {
    setBusy(true);
    try {
      const result = await api.demoReset();
      toast.push(`Demo data reset: ${result.caseCount} cases, ${result.customerCount} customers.`, "success");
      qc.invalidateQueries();
    } catch (err) {
      toast.push(`Reset failed: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function runAll() {
    setBusy(true);
    try {
      const result = await api.demoRun();
      toast.push(`Processed ${result.processed} cases.`, "success");
      qc.invalidateQueries();
    } catch (err) {
      toast.push(`Run failed: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !meta) return <LoadingState label="Loading settings…" />;

  return (
    <div className="p-6 max-w-[900px] mx-auto space-y-6">
      <PageHeader title="Settings & Integrations" subtitle="Data mode, AI provider, policy thresholds, and demo controls." />

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-1">Data Mode</h3>
        <p className="text-xs text-text-faint mb-4">Determined automatically from configured environment variables in backend/.env.</p>
        <Row label="Current mode" value={meta.dataMode === "RAZORPAY_TEST" ? "Razorpay TEST mode (live API calls)" : "Demo / synthetic mode"} ok={meta.dataMode === "RAZORPAY_TEST"} />
        <Row label="Razorpay credentials configured" value={meta.razorpayLiveConfigured ? "Yes" : "No — set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET"} ok={meta.razorpayLiveConfigured} />
        <Row label="AI provider" value={meta.aiProviderLabel} ok={meta.aiLiveConfigured} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-1">Bounded Autonomy Policy</h3>
        <p className="text-xs text-text-faint mb-4">Hard limits enforced by the deterministic policy engine — the AI cannot override these.</p>
        <Row label="Max automated retry attempts" value={String(meta.policy.maxRetries)} />
        <Row label="Minimum cooldown between attempts" value={`${meta.policy.minCooldownHours}h`} />
        <Row label="Max auto-recovery amount (no approval)" value={formatINR(meta.policy.maxAutoRecoveryPaise)} />
        <Row label="Human approval required above" value={formatINR(meta.policy.approvalThresholdPaise)} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-1">Demo Controls</h3>
        <p className="text-xs text-text-faint mb-4">
          Reset generates a fresh deterministic batch of 120+ synthetic revenue-risk cases (seeded, reproducible). Run processes every eligible case through
          the full agent pipeline.
        </p>
        <div className="flex gap-3">
          <button onClick={resetDemo} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-white/5">
            Reset Demo Data
          </button>
          <button onClick={runAll} disabled={busy} className="rounded-lg bg-accent hover:bg-accent-strong text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
            Run Revenue Recovery Simulation
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-1">Track</h3>
        <p className="text-sm text-text-muted">{meta.track}</p>
      </div>
    </div>
  );
}
