import { titleCase } from "../lib/format";

const STATUS_STYLES: Record<string, string> = {
  DETECTED: "bg-info-soft text-info border-info/30",
  DIAGNOSED: "bg-info-soft text-info border-info/30",
  STRATEGY_SELECTED: "bg-accent-soft text-accent-strong border-accent/30",
  POLICY_REVIEW: "bg-accent-soft text-accent-strong border-accent/30",
  AWAITING_APPROVAL: "bg-warning-soft text-warning border-warning/30",
  ACTION_IN_PROGRESS: "bg-accent-soft text-accent-strong border-accent/30",
  RECOVERED: "bg-success-soft text-success border-success/30",
  PARTIALLY_RECOVERED: "bg-success-soft text-success border-success/30",
  FAILED: "bg-danger-soft text-danger border-danger/30",
  ESCALATED: "bg-warning-soft text-warning border-warning/30",
  STOPPED: "bg-white/5 text-text-faint border-border",
  SUCCEEDED: "bg-success-soft text-success border-success/30",
  EXECUTING: "bg-accent-soft text-accent-strong border-accent/30",
  PLANNED: "bg-white/5 text-text-muted border-border",
  RETRY_SCHEDULED: "bg-warning-soft text-warning border-warning/30",
  PENDING: "bg-warning-soft text-warning border-warning/30",
  APPROVED: "bg-success-soft text-success border-success/30",
  REJECTED: "bg-danger-soft text-danger border-danger/30",
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? "bg-white/5 text-text-muted border-border";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {titleCase(status)}
    </span>
  );
}
