import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { PageHeader } from "../components/PageHeader";
import { LoadingState, EmptyState } from "../components/LoadingState";

const ENTITY_TYPES = ["CASE", "PAYMENT", "ACTION", "POLICY", "WEBHOOK", "APPROVAL", "SYSTEM"];

export function AuditTrail() {
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["audit", entityType, page],
    queryFn: () => api.audit({ entityType, page: String(page), pageSize: "60" }),
  });

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      <PageHeader
        title="Audit Trail"
        subtitle="Every meaningful state change — AI diagnosis, policy evaluation, executed action, and outcome — recorded as an immutable, append-only event."
      />

      <div className="flex items-center gap-2">
        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-text-faint">{data ? `${data.total} events` : ""}</span>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <LoadingState label="Loading audit trail…" />
        ) : !data?.events.length ? (
          <EmptyState title="No audit events yet" subtitle="Run the recovery simulation to generate audit activity." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-faint text-xs uppercase tracking-wide border-b border-border bg-white/[0.02]">
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Entity</th>
                  <th className="py-2.5 px-4">Event</th>
                  <th className="py-2.5 px-4">Actor</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Case</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((e) => (
                  <tr key={e.id} className="border-b border-border-soft">
                    <td className="py-2 px-4 text-xs font-mono text-text-faint whitespace-nowrap">{formatDate(e.createdAt)}</td>
                    <td className="py-2 px-4">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-text-faint">{e.entityType}</span>
                    </td>
                    <td className="py-2 px-4">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-soft text-accent-strong font-mono whitespace-nowrap">{e.eventType}</span>
                    </td>
                    <td className="py-2 px-4 text-xs text-text-muted whitespace-nowrap">{e.actor}</td>
                    <td className="py-2 px-4 text-text-muted max-w-md">{e.action}</td>
                    <td className="py-2 px-4">
                      {e.caseId && (
                        <Link to={`/cases/${e.caseId}`} className="text-xs text-accent-strong hover:underline">
                          {e.caseId.slice(-8)}
                        </Link>
                      )}
                    </td>
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
