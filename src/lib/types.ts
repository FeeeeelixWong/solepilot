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

export type PaymentScheme = "native-transfer" | "x402";

export interface PaymentIntent {
  payeeName: string;
  scheme: PaymentScheme;
  network: string;
  asset: string;
  amount: number;
  maxAmount: number;
  payTo: string;
  resource?: string;
  purpose: string;
  requirements: string;
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
  scheme?: PaymentScheme;
  asset?: string;
  network?: string;
  recipient?: string;
  resource?: string;
  requirements?: string;
  containsSensitiveData?: boolean;
}

export interface Mission {
  id: string;
  title: string;
  customer: string;
  source: string;
  contactEmail?: string;
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
  contactEmail?: string;
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
  provider: string;
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
  delivery?: {
    recipient?: string;
    subject: string;
  };
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
  approvalCapabilityId: string | null;
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
  version: 4;
  mission: Mission;
  statuses: Record<string, RuntimeStatus>;
  policies: OwnerPolicy[];
  receipts: RuntimeReceipt[];
  artifacts: ToolArtifact[];
  events: RuntimeEvent[];
  plannerMode: PlannerMode;
}

export interface PersistedWorkspace {
  version: 1;
  activeMissionId: string;
  runtimes: PersistedRuntime[];
}

export interface ApprovalCapability {
  id: string;
  missionId: string;
  actionId: string;
  actionDigest: string;
  policyDigest: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
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
