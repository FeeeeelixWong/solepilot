export type ActionKind =
  | "research"
  | "draft"
  | "external-send"
  | "commercial-commitment"
  | "spend"
  | "payment";

export type ToolName =
  | "workspace.search"
  | "web.search"
  | "document.compose"
  | "outbox.send"
  | "commitment.create"
  | "wallet.reserve"
  | "wallet.transfer";

export type MissionType = "work" | "payment";

export interface PaymentIntent {
  payeeName: string;
  recipientAddress: string;
  amountSol: number;
  maxAmountSol: number;
  purpose: string;
  requirements: string;
  network: "solana-devnet";
}

export type Decision = "allow" | "review" | "block";
export type PlannerMode = "replay" | "live-ai";
export type ExecutionMode = "sandbox" | "online";
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
  amount?: number;
  asset?: "SOL";
  network?: PaymentIntent["network"];
  recipient?: string;
  requirements?: string;
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
  missionType?: MissionType;
  payment?: PaymentIntent;
  status: MissionStatus;
  planSource: PlannerMode;
  executionMode: ExecutionMode;
  plannerModel: string;
  actions: AgentAction[];
}

export interface MissionDraft {
  objective: string;
  customer: string;
  source: string;
  deadline: string;
  budgetCapUsd: number;
  missionType: MissionType;
  payment?: PaymentIntent;
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
  provider:
    | "deterministic"
    | "puter-ai"
    | "sandbox"
    | "online-research"
    | "telegram"
    | "solana-devnet";
  title: string;
  summary: string;
  content: string;
  requestId?: string;
  externalReference?: string;
  evidence?: Array<{
    title: string;
    url: string;
    source: string;
  }>;
  attestation?: string;
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
  version: 3;
  mission: Mission;
  statuses: Record<string, RuntimeStatus>;
  policies: OwnerPolicy[];
  receipts: RuntimeReceipt[];
  artifacts: ToolArtifact[];
  events: RuntimeEvent[];
  plannerMode: PlannerMode;
}

export interface OnlineToolResult {
  provider: "online-research" | "telegram";
  requestId: string;
  summary: string;
  content: string;
  executedAt: string;
  externalReference?: string;
  evidence?: ToolArtifact["evidence"];
  attestation: string;
}
