export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-text-faint gap-3">
      <div className="h-6 w-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-1.5">
      <span className="text-sm font-medium text-text-muted">{title}</span>
      {subtitle && <span className="text-xs text-text-faint max-w-sm">{subtitle}</span>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-1.5">
      <span className="text-sm font-medium text-danger">Something went wrong</span>
      <span className="text-xs text-text-faint max-w-md">{message}</span>
    </div>
  );
}
