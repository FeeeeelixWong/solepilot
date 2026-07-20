export type ActionKind =
  | "research"
  | "draft"
  | "external-send"
  | "commercial-commitment"
  | "spend";

export type ToolName =
  | "workspace.search"
  | "document.compose"
  | "outbox.send"
  | "commitment.create"
  | "wallet.reserve";

export type Decision = "allow" | "review" | "block";
export type PlannerMode = "replay" | "live-ai";
export type MissionStatus = "ready" | "running" | "awaiting-owner" | "complete";
export type RuntimeStatus =
  | "pending"
  | "running"
  | "awaiting-owner"
  | "complete"
  | "blocked";
export type ActionOutcome = "delegated" | "approved" | "rejected" | "blocked";

export interface AgentAction {
  id: string;
  agent: string;
  title: string;
  description: string;
  kind: ActionKind;
  toolName: ToolName;
  destination?: string;
  amountUsd?: number;
  containsSensitiveData?: boolean;
}

export interface Mission {
  id: string;
  title: string;
  customer: string;
  source: string;
  objective: string;
  deadline: string;
  budgetCapUsd: number;
  status: MissionStatus;
  planSource: PlannerMode;
  plannerModel: string;
  actions: AgentAction[];
}

export interface MissionDraft {
  objective: string;
  customer: string;
  source: string;
  deadline: string;
  budgetCapUsd: number;
}

export interface OwnerPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface PolicyEvaluation {
  actionId: string;
  decision: Decision;
  reasons: string[];
  matchedPolicyIds: string[];
}

export interface ToolArtifact {
  id: string;
  missionId: string;
  actionId: string;
  toolName: ToolName;
  provider: "deterministic" | "puter-ai" | "sandbox";
  title: string;
  summary: string;
  content: string;
  createdAt: string;
}

export interface ActionReceipt {
  id: string;
  sequence: number;
  previousReceiptId: string | null;
  missionId: string;
  actionId: string;
  policyDecision: Decision;
  outcome: ActionOutcome;
  artifactDigest: string | null;
  canonicalPayload: string;
  createdAt: string;
}

export interface RuntimeReceipt extends ActionReceipt {
  resultLabel: string;
}

export interface RuntimeEvent {
  id: string;
  actionId?: string;
  tone: "neutral" | "success" | "review" | "blocked";
  label: string;
  detail: string;
  createdAt: string;
}

export interface PersistedRuntime {
  version: 2;
  mission: Mission;
  statuses: Record<string, RuntimeStatus>;
  policies: OwnerPolicy[];
  receipts: RuntimeReceipt[];
  artifacts: ToolArtifact[];
  events: RuntimeEvent[];
  plannerMode: PlannerMode;
}
