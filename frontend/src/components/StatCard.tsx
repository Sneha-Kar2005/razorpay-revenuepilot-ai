import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
  icon?: ReactNode;
}) {
  const toneColor = {
    neutral: "text-text",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    accent: "text-accent-strong",
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-text-faint">{label}</span>
        {icon && <span className="text-text-faint">{icon}</span>}
      </div>
      <span className={`text-2xl font-bold tabular-nums ${toneColor}`}>{value}</span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}
