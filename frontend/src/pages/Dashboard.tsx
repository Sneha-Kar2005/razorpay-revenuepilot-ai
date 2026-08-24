import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { api } from "../lib/api";
import { formatINR, formatPercent, formatDuration, titleCase } from "../lib/format";
import { StatCard } from "../components/StatCard";
import { StatusBadge } from "../components/StatusBadge";
import { PageHeader } from "../components/PageHeader";
import { LoadingState } from "../components/LoadingState";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#38bdf8", "#a78bfa", "#f472b6", "#94a1b8", "#34d399", "#fb923c"];

export function Dashboard() {
  const { data: analytics, isLoading } = useQuery({ queryKey: ["analytics"], queryFn: api.analytics });
  const { data: recentCases } = useQuery({ queryKey: ["cases", "recent"], queryFn: () => api.cases({ pageSize: "6" }) });

  if (isLoading || !analytics) return <LoadingState label="Loading executive dashboard…" />;

  const t = analytics.totals;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Executive Revenue Recovery Dashboard"
        subtitle="Real-time measured view of revenue at risk, recovered, and the bounded agent's activity across the batch."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Revenue At Risk" value={formatINR(t.totalAtRiskPaise, { compact: true })} sub={`${t.caseCount} cases`} />
        <StatCard label="Eligible for Recovery" value={formatINR(t.eligibleRecoveryPaise, { compact: true })} sub="not blocked by policy" />
        <StatCard label="Recovered Revenue" value={formatINR(t.recoveredRevenuePaise, { compact: true })} tone="success" sub={`${t.recoveredCaseCount} cases recovered`} />
        <StatCard label="Net Recovered" value={formatINR(t.netRecoveredRevenuePaise, { compact: true })} tone="success" sub={`after ${formatINR(t.recoveryCostPaise, { compact: true })} recovery cost`} />
        <StatCard label="Recovery Rate" value={formatPercent(t.recoveryRate)} tone="accent" sub="recovered / eligible" />
        <StatCard label="Avg Recovery Time" value={t.avgRecoveryTimeSeconds ? formatDuration(t.avgRecoveryTimeSeconds) : "—"} sub="detection → recovery" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Escalation Rate" value={formatPercent(t.escalationRate)} tone="warning" sub="handed to a human" />
        <StatCard label="Policy-Stopped Rate" value={formatPercent(t.stoppedRate)} sub="opt-outs, suspicious, exhausted" />
        <StatCard label="Bad Intervention Rate" value={formatPercent(t.badInterventionRate)} tone={t.badInterventionRate > 0.15 ? "danger" : "neutral"} sub="our own API/channel failures" />
        <StatCard label="Total Actions Executed" value={String(t.totalActions)} sub="bounded, audited actions" />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold mb-4">Recovered Revenue by Strategy</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={analytics.strategyPerformance} margin={{ left: 0, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232b3a" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#94a1b8", fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fill: "#94a1b8", fontSize: 11 }} tickFormatter={(v) => formatINR(v, { compact: true })} width={70} />
              <Tooltip
                formatter={(v) => formatINR(Number(v))}
                contentStyle={{ background: "#161c29", border: "1px solid #232b3a", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="recoveredPaise" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold mb-4">Case Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={analytics.statusBreakdown} dataKey="count" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {analytics.statusBreakdown.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, n) => [String(v), titleCase(String(n))]}
                contentStyle={{ background: "#161c29", border: "1px solid #232b3a", borderRadius: 8, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {analytics.statusBreakdown.map((s, i) => (
              <div key={s.status} className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {titleCase(s.status)} ({s.count})
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Recently Detected Cases</h3>
          <Link to="/queue" className="text-xs text-accent-strong hover:underline">
            View full risk queue →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-faint text-xs uppercase tracking-wide border-b border-border">
                <th className="pb-2 pr-4">Customer</th>
                <th className="pb-2 pr-4">Source</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Priority</th>
              </tr>
            </thead>
            <tbody>
              {recentCases?.cases.map((c) => (
                <tr key={c.id} className="border-b border-border-soft hover:bg-white/[0.02] cursor-pointer" onClick={() => (window.location.href = `/cases/${c.id}`)}>
                  <td className="py-2.5 pr-4">
                    <div className="font-medium">{c.customer.name}</div>
                    <div className="text-xs text-text-faint">{c.customer.segment}</div>
                  </td>
                  <td className="py-2.5 pr-4 text-text-muted">{titleCase(c.sourceType)}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{formatINR(c.amountAtRiskPaise)}</td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums text-text-muted">{c.priorityScore.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
