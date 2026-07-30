import { canonicalize, sha256 } from "./receipt";
import type {
  AgentAction,
  ApprovalCapability,
  Mission,
  PolicyEvaluation,
} from "./types";

const consumedCapabilities = new Set<string>();

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function actionDigest(action: AgentAction, mission: Mission): Promise<string> {
  return sha256(canonicalize({
    action,
    mission: {
      budgetCapUsd: mission.budgetCapUsd,
      deadline: mission.deadline,
      id: mission.id,
      payment: mission.payment ?? null,
    },
  }));
}

async function policyDigest(evaluation: PolicyEvaluation): Promise<string> {
  return sha256(canonicalize({
    actionId: evaluation.actionId,
    decision: evaluation.decision,
    matchedPolicyIds: evaluation.matchedPolicyIds,
    reasons: evaluation.reasons,
  }));
}

export async function issueApprovalCapability(
  action: AgentAction,
  mission: Mission,
  evaluation: PolicyEvaluation,
  ttlMs = 5 * 60_000,
): Promise<ApprovalCapability> {
  if (evaluation.decision !== "review" || evaluation.actionId !== action.id) {
    throw new Error("Approval capabilities can only release the reviewed action.");
  }

  const issuedAt = new Date();
  const nonce = randomNonce();
  const [boundAction, boundPolicy] = await Promise.all([
    actionDigest(action, mission),
    policyDigest(evaluation),
  ]);
  const idDigest = await sha256(canonicalize({
    actionDigest: boundAction,
    issuedAt: issuedAt.toISOString(),
    missionId: mission.id,
    nonce,
    policyDigest: boundPolicy,
  }));

  return {
    id: `cap_${idDigest.slice(0, 24)}`,
    missionId: mission.id,
    actionId: action.id,
    actionDigest: boundAction,
    policyDigest: boundPolicy,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
    nonce,
  };
}

export async function consumeApprovalCapability(
  capability: ApprovalCapability | undefined,
  action: AgentAction,
  mission: Mission,
  evaluation: PolicyEvaluation,
): Promise<void> {
  if (!capability) throw new Error("Owner approval capability is required.");
  if (consumedCapabilities.has(capability.id)) {
    throw new Error("Owner approval capability has already been consumed.");
  }
  if (
    capability.missionId !== mission.id ||
    capability.actionId !== action.id ||
    Date.parse(capability.expiresAt) <= Date.now()
  ) {
    throw new Error("Owner approval capability is invalid or expired.");
  }

  const [expectedAction, expectedPolicy] = await Promise.all([
    actionDigest(action, mission),
    policyDigest(evaluation),
  ]);
  if (
    capability.actionDigest !== expectedAction ||
    capability.policyDigest !== expectedPolicy
  ) {
    throw new Error("Owner approval capability does not match the current action and policy.");
  }

  // Consume before external invocation to preserve an at-most-once release boundary.
  consumedCapabilities.add(capability.id);
}
