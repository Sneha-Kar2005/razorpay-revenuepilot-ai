import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { formatINR, titleCase, formatRelative } from "../lib/format";
import { StatusBadge } from "../components/StatusBadge";
import { PageHeader } from "../components/PageHeader";
import { LoadingState, EmptyState } from "../components/LoadingState";

const STATUSES = ["DETECTED", "DIAGNOSED", "STRATEGY_SELECTED", "AWAITING_APPROVAL", "ACTION_IN_PROGRESS", "RECOVERED", "PARTIALLY_RECOVERED", "FAILED", "ESCALATED", "STOPPED"];
const SOURCE_TYPES = ["FAILED_PAYMENT", "CHECKOUT_ABANDONED", "SUBSCRIPTION_DEGRADED", "RECEIVABLE_OVERDUE"];
const SEGMENTS = ["NEW", "STANDARD", "HIGH_VALUE", "VIP"];

function Select({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {titleCase(o)}
        </option>
      ))}
    </select>
  );
}

export function RiskQueue() {
  const [status, setStatus] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [segment, setSegment] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["cases", { status, sourceType, segment, search, page }],
    queryFn: () => api.cases({ status, sourceType, segment, search, page: String(page), pageSize: "25" }),
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">
      <PageHeader title="Revenue-at-Risk Queue" subtitle="Every detected case, prioritised by amount, customer value and urgency." />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search customer name…"
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUSES} placeholder="All statuses" />
        <Select value={sourceType} onChange={(v) => { setSourceType(v); setPage(1); }} options={SOURCE_TYPES} placeholder="All sources" />
        <Select value={segment} onChange={(v) => { setSegment(v); setPage(1); }} options={SEGMENTS} placeholder="All segments" />
        {(status || sourceType || segment || search) && (
          <button
            onClick={() => { setStatus(""); setSourceType(""); setSegment(""); setSearch(""); setPage(1); }}
            className="text-xs text-text-faint hover:text-text-muted"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-text-faint">{data ? `${data.total} cases` : ""}</span>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <LoadingState label="Loading risk queue…" />
        ) : !data?.cases.length ? (
          <EmptyState title="No cases match these filters" subtitle="Try clearing a filter, or run the demo seed from Settings." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-faint text-xs uppercase tracking-wide border-b border-border bg-white/[0.02]">
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Source</th>
                  <th className="py-2.5 px-4">Root Cause</th>
                  <th className="py-2.5 px-4">Amount at Risk</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Attempts</th>
                  <th className="py-2.5 px-4">Priority</th>
                  <th className="py-2.5 px-4">Detected</th>
                </tr>
              </thead>
              <tbody>
                {data.cases.map((c) => (
                  <tr key={c.id} className="border-b border-border-soft hover:bg-white/[0.02] cursor-pointer" onClick={() => navigate(`/cases/${c.id}`)}>
                    <td className="py-2.5 px-4">
                      <div className="font-medium">{c.customer.name}</div>
                      <div className="text-xs text-text-faint">{c.customer.segment}{c.customer.optedOutOfContact ? " · opted out" : ""}</div>
                    </td>
                    <td className="py-2.5 px-4 text-text-muted">{titleCase(c.sourceType)}</td>
                    <td className="py-2.5 px-4 text-text-muted">{titleCase(c.riskCategory)}</td>
                    <td className="py-2.5 px-4 tabular-nums font-medium">{formatINR(c.amountAtRiskPaise)}</td>
                    <td className="py-2.5 px-4">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-2.5 px-4 tabular-nums text-text-muted">{c.attemptsMade}/{c.maxAttempts}</td>
                    <td className="py-2.5 px-4 tabular-nums text-text-muted">{c.priorityScore.toFixed(1)}</td>
                    <td className="py-2.5 px-4 text-text-faint text-xs">{formatRelative(c.detectedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-md border border-border disabled:opacity-40">
            Previous
          </button>
          <span className="text-text-faint text-xs">
            Page {page} of {Math.ceil(data.total / data.pageSize)}
          </span>
          <button disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-md border border-border disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
