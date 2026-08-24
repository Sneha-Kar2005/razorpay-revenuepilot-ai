import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api } from "../lib/api";
import { formatINR, formatPercent, titleCase } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { LoadingState } from "../components/LoadingState";

export function Analytics() {
  const { data, isLoading } = useQuery({ queryKey: ["analytics"], queryFn: api.analytics });

  if (isLoading || !data) return <LoadingState label="Loading analytics…" />;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title="Recovery Analytics & Strategy Performance" subtitle="Aggregate outcomes across the full batch — not a single cherry-picked case." />

      <div className="rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-4">Strategy Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-faint text-xs uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4">Strategy</th>
                <th className="py-2 pr-4">Attempts</th>
                <th className="py-2 pr-4">Successes</th>
                <th className="py-2 pr-4">Success Rate</th>
                <th className="py-2 pr-4">Recovered</th>
                <th className="py-2 pr-4">Avg Recovered / Success</th>
              </tr>
            </thead>
            <tbody>
              {[...data.strategyPerformance].sort((a, b) => b.recoveredPaise - a.recoveredPaise).map((s) => (
                <tr key={s.code} className="border-b border-border-soft">
                  <td className="py-2.5 pr-4 font-medium">{s.name}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-text-muted">{s.attempts}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-text-muted">{s.successes}</td>
                  <td className="py-2.5 pr-4 tabular-nums">
                    <span className={s.successRate >= 0.4 ? "text-success" : s.successRate >= 0.2 ? "text-warning" : "text-danger"}>{formatPercent(s.successRate)}</span>
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums font-semibold">{formatINR(s.recoveredPaise)}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-text-muted">{formatINR(s.avgRecoveredPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold mb-4">Recovery Rate by Failure/Risk Type</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.failureTypeBreakdown} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232b3a" horizontal={false} />
              <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fill: "#94a1b8", fontSize: 11 }} />
              <YAxis type="category" dataKey="riskCategory" width={140} tickFormatter={(v) => titleCase(v)} tick={{ fill: "#94a1b8", fontSize: 11 }} />
              <Tooltip formatter={(v) => formatPercent(Number(v))} contentStyle={{ background: "#161c29", border: "1px solid #232b3a", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="recoveryRate" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold mb-4">Amount at Risk vs Recovered by Segment</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.segmentBreakdown}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232b3a" vertical={false} />
              <XAxis dataKey="segment" tick={{ fill: "#94a1b8", fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatINR(v, { compact: true })} tick={{ fill: "#94a1b8", fontSize: 11 }} width={70} />
              <Tooltip formatter={(v) => formatINR(Number(v))} contentStyle={{ background: "#161c29", border: "1px solid #232b3a", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="amountAtRiskPaise" name="At Risk" fill="#38343e" fillOpacity={0.5} stroke="#5b6478" radius={[4, 4, 0, 0]} />
              <Bar dataKey="recoveredPaise" name="Recovered" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-text-faint uppercase tracking-wide mb-1">Attempted Recovery</div>
          <div className="text-lg font-bold">{formatINR(data.totals.attemptedRecoveryPaise, { compact: true })}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-text-faint uppercase tracking-wide mb-1">Recovery Cost</div>
          <div className="text-lg font-bold">{formatINR(data.totals.recoveryCostPaise, { compact: true })}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-text-faint uppercase tracking-wide mb-1">Customer No-Response Rate</div>
          <div className="text-lg font-bold">{formatPercent(data.totals.customerNoResponseRate)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs text-text-faint uppercase tracking-wide mb-1">Escalation Rate</div>
          <div className="text-lg font-bold">{formatPercent(data.totals.escalationRate)}</div>
        </div>
      </div>
    </div>
  );
}
