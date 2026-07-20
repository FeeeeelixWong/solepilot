export type ActionKind =
  | "research"
  | "draft"
  | "external-send"
  | "commercial-commitment"
  | "spend";

export type Decision = "allow" | "review" | "block";

export type MissionStatus = "ready" | "running" | "awaiting-owner" | "complete";

export interface AgentAction {
  id: string;
  agent: string;
  title: string;
  description: string;
  kind: ActionKind;
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
  actions: AgentAction[];
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

export interface ActionReceipt {
  id: string;
  missionId: string;
  actionId: string;
  decision: Decision;
  canonicalPayload: string;
  createdAt: string;
}
