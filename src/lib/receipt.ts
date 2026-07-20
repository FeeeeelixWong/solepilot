import type { ActionReceipt, Mission, PolicyEvaluation } from "./types";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }

  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createReceipt(
  mission: Mission,
  evaluation: PolicyEvaluation,
): Promise<ActionReceipt> {
  const action = mission.actions.find(
    (candidate) => candidate.id === evaluation.actionId,
  );

  if (!action) {
    throw new Error(`Action ${evaluation.actionId} does not exist in mission ${mission.id}.`);
  }

  const canonicalPayload = canonicalize({
    action,
    decision: evaluation.decision,
    matchedPolicyIds: evaluation.matchedPolicyIds,
    mission: {
      budgetCapUsd: mission.budgetCapUsd,
      id: mission.id,
      objective: mission.objective,
    },
  });
  const digest = await sha256(canonicalPayload);

  return {
    id: `sp_${digest.slice(0, 20)}`,
    missionId: mission.id,
    actionId: action.id,
    decision: evaluation.decision,
    canonicalPayload,
    createdAt: new Date().toISOString(),
  };
}
