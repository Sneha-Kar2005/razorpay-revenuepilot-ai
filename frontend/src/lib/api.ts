const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => request<Meta>("/meta"),
  cases: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return request<CaseListResponse>(`/recovery/cases${qs ? `?${qs}` : ""}`);
  },
  caseDetail: (id: string) => request<CaseDetail>(`/recovery/cases/${id}`),
  runCase: (id: string) => request<CycleResult>(`/recovery/cases/${id}/run`, { method: "POST" }),
  approveCase: (id: string, approve: boolean, notes?: string) =>
    request<CycleResult>(`/recovery/cases/${id}/approve`, { method: "POST", body: JSON.stringify({ approve, notes }) }),
  analytics: () => request<Analytics>("/analytics"),
  audit: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return request<AuditResponse>(`/audit${qs ? `?${qs}` : ""}`);
  },
  demoRun: (limit?: number) => request<DemoRunResponse>("/demo/run", { method: "POST", body: JSON.stringify(limit ? { limit } : {}) }),
  demoReset: () => request<{ ok: boolean; caseCount: number; customerCount: number }>("/demo/reset", { method: "POST" }),
};

export interface Meta {
  product: string;
  track: string;
  dataMode: "RAZORPAY_TEST" | "DEMO";
  razorpayLiveConfigured: boolean;
  aiLiveConfigured: boolean;
  aiProviderLabel: string;
  policy: { maxRetries: number; minCooldownHours: number; maxAutoRecoveryPaise: number; approvalThresholdPaise: number };
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  segment: "NEW" | "STANDARD" | "HIGH_VALUE" | "VIP";
  lifetimeValuePaise: number;
  optedOutOfContact: boolean;
}

export interface RiskCase {
  id: string;
  merchantId: string;
  customerId: string;
  sourceType: string;
  amountAtRiskPaise: number;
  currency: string;
  riskCategory: string;
  priorityScore: number;
  status: string;
  attemptsMade: number;
  maxAttempts: number;
  nextEligibleAt: string | null;
  recoveredAmountPaise: number;
  detectedAt: string;
  updatedAt: string;
  customer: Customer;
  payment?: any;
  receivable?: any;
}

export interface CaseListResponse {
  total: number;
  page: number;
  pageSize: number;
  cases: RiskCase[];
}

export interface AgentDecision {
  id: string;
  provider: string;
  modelId?: string;
  rootCause: string;
  confidence: number;
  signals: string;
  recommendedStrategyCode: string;
  recommendedReason: string;
  expectedRecoveryProbability: number;
  expectedRecoveredAmountPaise: number;
  maxAttempts: number;
  cooldownHours: number;
  stoppingConditions: string;
  escalationCondition: string;
  complianceNotes: string;
  createdAt: string;
}

export interface PolicyDecisionRow {
  id: string;
  allowed: boolean;
  requiresApproval: boolean;
  reasonCodes: string;
  appliedRules: string;
  createdAt: string;
}

export interface RecoveryActionRow {
  id: string;
  strategyId: string;
  strategy: { code: string; name: string; description: string };
  attemptNumber: number;
  status: string;
  channel: string;
  resultSummary?: string;
  recoveredAmountPaise?: number;
  failureCode?: string;
  createdAt: string;
  outcomes: { outcome: string; recoveredAmountPaise: number; recoveryCostPaise: number; timeToRecoverySeconds?: number }[];
}

export interface ApprovalRequestRow {
  id: string;
  reason: string;
  status: string;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
  notes?: string;
}

export interface AuditEventRow {
  id: string;
  caseId?: string;
  entityType: string;
  entityId: string;
  eventType: string;
  actor: string;
  action: string;
  previousState: any;
  newState: any;
  aiRecommendation: any;
  policyDecision: any;
  executionResult: any;
  amountPaise?: number;
  createdAt: string;
}

export interface CaseDetail extends RiskCase {
  agentDecisions: AgentDecision[];
  policyDecisions: PolicyDecisionRow[];
  actions: RecoveryActionRow[];
  approvalRequests: ApprovalRequestRow[];
  auditEvents: AuditEventRow[];
}

export interface CycleResult {
  status: string;
  reason?: string;
  caseId: string;
}

export interface DemoRunResponse {
  processed: number;
  summary: Record<string, number>;
  results: CycleResult[];
}

export interface AuditResponse {
  total: number;
  page: number;
  pageSize: number;
  events: AuditEventRow[];
}

export interface AnalyticsTotals {
  totalAtRiskPaise: number;
  eligibleRecoveryPaise: number;
  attemptedRecoveryPaise: number;
  recoveredRevenuePaise: number;
  recoveryCostPaise: number;
  netRecoveredRevenuePaise: number;
  recoveryRate: number;
  avgRecoveryTimeSeconds: number;
  caseCount: number;
  recoveredCaseCount: number;
  escalationRate: number;
  stoppedRate: number;
  badInterventionRate: number;
  customerNoResponseRate: number;
  totalActions: number;
}

export interface Analytics {
  totals: AnalyticsTotals;
  strategyPerformance: { code: string; name: string; attempts: number; successes: number; recoveredPaise: number; successRate: number; avgRecoveredPaise: number }[];
  failureTypeBreakdown: { riskCategory: string; total: number; recovered: number; amountAtRiskPaise: number; recoveredPaise: number; recoveryRate: number }[];
  segmentBreakdown: { segment: string; total: number; amountAtRiskPaise: number; recoveredPaise: number }[];
  statusBreakdown: { status: string; count: number }[];
}
