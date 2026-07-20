import type { AgentAction, Mission, OnlineToolResult, ToolArtifact } from "./types";

async function postOnlineTool(
  path: string,
  body: unknown,
  ownerCode?: string,
): Promise<OnlineToolResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ownerCode ? { "X-SolePilot-Owner-Code": ownerCode } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null) as
    | (OnlineToolResult & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(payload?.error || `Online tool failed with status ${response.status}.`);
  }
  if (!payload?.requestId || !payload.attestation) {
    throw new Error("The online tool returned an unverifiable response.");
  }

  const { attestation, ...result } = payload;
  const verification = await fetch("/api/attestations/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attestation, result }),
  });
  const verdict = await verification.json().catch(() => null) as { valid?: boolean } | null;
  if (!verification.ok || !verdict?.valid) {
    throw new Error("The online tool attestation could not be verified.");
  }
  return payload;
}

export function runOnlineResearch(
  action: AgentAction,
  mission: Mission,
): Promise<OnlineToolResult> {
  return postOnlineTool("/api/tools/research", {
    actionId: action.id,
    customer: mission.customer,
    missionId: mission.id,
    objective: mission.objective,
  });
}

export function sendTelegramDelivery(
  action: AgentAction,
  mission: Mission,
  previousArtifacts: ToolArtifact[],
  ownerCode: string,
): Promise<OnlineToolResult> {
  const deliveryArtifact = [...previousArtifacts]
    .reverse()
    .find((artifact) => artifact.toolName === "document.compose");

  if (!deliveryArtifact) {
    throw new Error("A completed delivery artifact is required before external send.");
  }

  return postOnlineTool(
    "/api/tools/telegram",
    {
      actionId: action.id,
      artifactId: deliveryArtifact.id,
      content: deliveryArtifact.content,
      missionId: mission.id,
      objective: mission.objective,
      title: mission.title,
    },
    ownerCode,
  );
}

export interface RuntimeHealth {
  online: boolean;
  planner: boolean;
  research: boolean;
  telegram: boolean;
  attestation: boolean;
  version: string;
}

export async function getRuntimeHealth(): Promise<RuntimeHealth> {
  const response = await fetch("/api/health", { cache: "no-store" });
  if (!response.ok) throw new Error("Online runtime is unavailable.");
  return response.json() as Promise<RuntimeHealth>;
}
