import type {
  AgentAction,
  Mission,
  OwnerPolicy,
  PolicyEvaluation,
} from "./types";

export const ownerPolicies: OwnerPolicy[] = [
  {
    id: "policy-private-data",
    name: "Keep private data private",
    description: "Block external actions that contain sensitive customer data.",
    enabled: true,
  },
  {
    id: "policy-budget-cap",
    name: "Never exceed the mission cap",
    description: "Block spending above the owner-defined mission budget.",
    enabled: true,
  },
  {
    id: "policy-owner-approval",
    name: "Owner approves consequential actions",
    description: "Require approval before spending, sending, or making commitments.",
    enabled: true,
  },
  {
    id: "policy-routine-work",
    name: "Routine work can run autonomously",
    description: "Allow research and drafting when no higher-risk rule applies.",
    enabled: true,
  },
];

export function evaluateAction(
  action: AgentAction,
  mission: Mission,
  policies: OwnerPolicy[] = ownerPolicies,
): PolicyEvaluation {
  const enabled = new Set(
    policies.filter((policy) => policy.enabled).map((policy) => policy.id),
  );

  if (
    enabled.has("policy-private-data") &&
    action.containsSensitiveData &&
    action.kind === "external-send"
  ) {
    return {
      actionId: action.id,
      decision: "block",
      reasons: ["Sensitive data cannot leave the owner's workspace."],
      matchedPolicyIds: ["policy-private-data"],
    };
  }

  if (
    enabled.has("policy-budget-cap") &&
    action.kind === "spend" &&
    (action.amountUsd ?? 0) > mission.budgetCapUsd
  ) {
    return {
      actionId: action.id,
      decision: "block",
      reasons: [
        `The requested $${action.amountUsd?.toFixed(2)} exceeds the $${mission.budgetCapUsd.toFixed(2)} mission cap.`,
      ],
      matchedPolicyIds: ["policy-budget-cap"],
    };
  }

  if (
    enabled.has("policy-owner-approval") &&
    ["external-send", "commercial-commitment", "spend"].includes(action.kind)
  ) {
    return {
      actionId: action.id,
      decision: "review",
      reasons: ["The action changes money, reputation, or an external commitment."],
      matchedPolicyIds: ["policy-owner-approval"],
    };
  }

  return {
    actionId: action.id,
    decision: "allow",
    reasons: ["Routine internal work is within the agent's delegated authority."],
    matchedPolicyIds: ["policy-routine-work"],
  };
}

export function evaluateMission(mission: Mission): PolicyEvaluation[] {
  return mission.actions.map((action) => evaluateAction(action, mission));
}
