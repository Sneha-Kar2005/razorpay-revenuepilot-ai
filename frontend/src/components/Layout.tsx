import { NavLink, Outlet } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { useToast } from "./Toast";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/queue", label: "Risk Queue" },
  { to: "/analytics", label: "Analytics" },
  { to: "/audit", label: "Audit Trail" },
  { to: "/settings", label: "Settings" },
];

export function Layout() {
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: api.meta });
  const qc = useQueryClient();
  const toast = useToast();
  const [running, setRunning] = useState(false);

  async function runSimulation() {
    setRunning(true);
    try {
      const result = await api.demoRun();
      toast.push(`Simulation complete: ${result.processed} cases processed.`, "success");
      qc.invalidateQueries();
    } catch (err) {
      toast.push(`Simulation failed: ${(err as Error).message}`, "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className={`w-full text-center text-xs font-semibold tracking-wide py-1.5 ${meta?.dataMode === "RAZORPAY_TEST" ? "bg-info-soft text-info" : "bg-warning-soft text-warning"}`}>
        {meta?.dataMode === "RAZORPAY_TEST" ? "RAZORPAY TEST MODE — connected to live Razorpay test-mode APIs" : "DEMO / SYNTHETIC MODE — deterministic simulated data, no live Razorpay calls"}
        {meta && <span className="mx-2 opacity-60">•</span>}
        {meta && (meta.aiLiveConfigured ? `AI: ${meta.aiProviderLabel}` : "AI: Simulated (rule-based, no live LLM key configured)")}
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="w-60 shrink-0 border-r border-border bg-surface flex flex-col">
          <div className="px-5 py-5 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center font-bold text-white text-sm">RP</div>
              <div>
                <div className="font-bold text-sm leading-tight">RevenuePilot AI</div>
                <div className="text-[10px] text-text-faint leading-tight">Revenue Recovery Agent</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-accent-soft text-accent-strong" : "text-text-muted hover:bg-white/5 hover:text-text"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-border">
            <button
              onClick={runSimulation}
              disabled={running}
              className="w-full rounded-lg bg-accent hover:bg-accent-strong disabled:opacity-50 text-white text-sm font-semibold py-2.5 transition-colors"
            >
              {running ? "Running simulation…" : "Run Recovery Simulation"}
            </button>
            <p className="mt-2 text-[10px] text-text-faint leading-snug">
              Runs one full DETECT → DIAGNOSE → POLICY → ACT → VERIFY cycle across every eligible case.
            </p>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
