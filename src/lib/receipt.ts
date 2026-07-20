import type {
  ActionOutcome,
  ActionReceipt,
  Mission,
  PolicyEvaluation,
  ToolArtifact,
} from "./types";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);

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

export async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function digestArtifact(
  artifact?: ToolArtifact,
): Promise<string | null> {
  if (!artifact) return null;

  return sha256(
    canonicalize({
      actionId: artifact.actionId,
      attestation: artifact.attestation ?? null,
      content: artifact.content,
      evidence: artifact.evidence ?? [],
      externalReference: artifact.externalReference ?? null,
      missionId: artifact.missionId,
      provider: artifact.provider,
      requestId: artifact.requestId ?? null,
      summary: artifact.summary,
      toolName: artifact.toolName,
    }),
  );
}

export async function createReceipt(
  mission: Mission,
  evaluation: PolicyEvaluation,
  outcome: ActionOutcome = evaluation.decision === "block"
    ? "blocked"
    : evaluation.decision === "review"
      ? "approved"
      : "delegated",
  previousReceiptId: string | null = null,
  sequence = 1,
  artifact?: ToolArtifact,
): Promise<ActionReceipt> {
  const action = mission.actions.find(
    (candidate) => candidate.id === evaluation.actionId,
  );

  if (!action) {
    throw new Error(`Action ${evaluation.actionId} does not exist in mission ${mission.id}.`);
  }

  const artifactDigest = await digestArtifact(artifact);
  const canonicalPayload = canonicalize({
    action,
    artifactDigest,
    outcome,
    policy: {
      decision: evaluation.decision,
      matchedPolicyIds: evaluation.matchedPolicyIds,
      reasons: evaluation.reasons,
    },
    mission: {
      budgetCapUsd: mission.budgetCapUsd,
      id: mission.id,
      objective: mission.objective,
      executionMode: mission.executionMode,
      planSource: mission.planSource,
    },
    previousReceiptId,
    sequence,
  });
  const digest = await sha256(canonicalPayload);

  return {
    id: `sp_${digest.slice(0, 24)}`,
    sequence,
    previousReceiptId,
    missionId: mission.id,
    actionId: action.id,
    policyDecision: evaluation.decision,
    outcome,
    artifactDigest,
    canonicalPayload,
    createdAt: new Date().toISOString(),
  };
}

export async function verifyReceiptChain(
  receipts: ActionReceipt[],
): Promise<{ valid: boolean; checked: number; error?: string }> {
  let previousReceiptId: string | null = null;

  for (let index = 0; index < receipts.length; index += 1) {
    const receipt = receipts[index];
    const digest = await sha256(receipt.canonicalPayload);
    const expectedId = `sp_${digest.slice(0, 24)}`;

    if (receipt.id !== expectedId) {
      return { valid: false, checked: index, error: `Receipt ${index + 1} digest mismatch.` };
    }

    if (receipt.sequence !== index + 1) {
      return { valid: false, checked: index, error: `Receipt ${index + 1} sequence mismatch.` };
    }

    if (receipt.previousReceiptId !== previousReceiptId) {
      return { valid: false, checked: index, error: `Receipt ${index + 1} chain link mismatch.` };
    }

    const payload = JSON.parse(receipt.canonicalPayload) as {
      previousReceiptId: string | null;
      sequence: number;
    };
    if (
      payload.previousReceiptId !== previousReceiptId ||
      payload.sequence !== index + 1
    ) {
      return { valid: false, checked: index, error: `Receipt ${index + 1} payload mismatch.` };
    }

    previousReceiptId = receipt.id;
  }

  return { valid: true, checked: receipts.length };
}
