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
    id: "policy-payment-intent",
    name: "Payment must match owner intent",
    description: "Block changes to the recipient, amount, asset, network, purpose, or requirements entered by the owner.",
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

  if (action.kind === "payment") {
    const payment = mission.payment;
    const matchesIntent = Boolean(
      payment &&
      action.recipient === payment.recipientAddress &&
      action.amount === payment.amountSol &&
      action.asset === "SOL" &&
      action.network === payment.network &&
      action.description === payment.purpose &&
      action.requirements === payment.requirements,
    );
    if (enabled.has("policy-payment-intent") && !matchesIntent) {
      return {
        actionId: action.id,
        decision: "block",
        reasons: ["The proposed transfer does not match the owner-entered payment intent."],
        matchedPolicyIds: ["policy-payment-intent"],
      };
    }
    const deadline = Date.parse(`${mission.deadline}T23:59:59.999Z`);
    if (
      enabled.has("policy-payment-intent") &&
      (!Number.isFinite(deadline) || Date.now() > deadline)
    ) {
      return {
        actionId: action.id,
        decision: "block",
        reasons: ["The owner-entered payment deadline has expired."],
        matchedPolicyIds: ["policy-payment-intent"],
      };
    }
    if (
      enabled.has("policy-budget-cap") &&
      payment &&
      (action.amount ?? 0) > payment.maxAmountSol
    ) {
      return {
        actionId: action.id,
        decision: "block",
        reasons: [
          `The requested ${action.amount?.toFixed(4)} SOL exceeds the ${payment.maxAmountSol.toFixed(4)} SOL mission cap.`,
        ],
        matchedPolicyIds: ["policy-budget-cap"],
      };
    }
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
    ["external-send", "commercial-commitment", "spend", "payment"].includes(action.kind)
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
