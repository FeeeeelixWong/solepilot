import { canonicalize, sha256 } from "./receipt";
import { puterChat, type ChatCompletion } from "./planner";
import { evaluateAction } from "./policy";
import type {
  AgentAction,
  Mission,
  OwnerPolicy,
  PlannerMode,
  PolicyEvaluation,
  ToolArtifact,
} from "./types";

function deterministicContent(
  action: AgentAction,
  mission: Mission,
  previousArtifacts: ToolArtifact[],
): { summary: string; content: string; provider: ToolArtifact["provider"] } {
  const evidence = previousArtifacts.map((artifact) => artifact.summary).join(" ");

  switch (action.toolName) {
    case "workspace.search":
      return {
        provider: "deterministic",
        summary: `Found 3 decision signals for ${mission.customer}.`,
        content: [
          `Workspace evidence for ${mission.customer}`,
          `1. The stated objective is: ${mission.objective}`,
          `2. Success requires a bounded delivery before ${mission.deadline}.`,
          `3. Commercial actions must remain within the $${mission.budgetCapUsd} owner cap.`,
        ].join("\n"),
      };
    case "document.compose":
      return {
        provider: "deterministic",
        summary: "Produced a scoped brief with acceptance criteria and exclusions.",
        content: [
          `Execution brief: ${mission.title}`,
          `Objective: ${mission.objective}`,
          `Evidence: ${evidence || "No prior artifact."}`,
          "Acceptance: deliver a reviewable result, preserve owner approval, and record every action.",
          "Exclusions: no live payment, binding commitment, or external delivery without approval.",
        ].join("\n"),
      };
    case "outbox.send":
      return {
        provider: "sandbox",
        summary: `Created a sandbox delivery record for ${action.destination ?? mission.customer}.`,
        content: `SANDBOX OUTBOX\nRecipient: ${action.destination ?? mission.customer}\nSubject: ${mission.title}\nStatus: accepted after owner approval\nNo live message was sent.`,
      };
    case "commitment.create":
      return {
        provider: "sandbox",
        summary: "Created a non-binding commitment record after owner approval.",
        content: `SANDBOX COMMITMENT\nCounterparty: ${action.destination ?? mission.customer}\nScope: ${action.description}\nStatus: owner approved\nNo binding agreement was created.`,
      };
    case "wallet.reserve":
      return {
        provider: "sandbox",
        summary: `Reserved $${action.amountUsd ?? 0} in the sandbox ledger.`,
        content: `SANDBOX RESERVATION\nVendor: ${action.destination ?? "Unspecified"}\nAmount: $${action.amountUsd ?? 0}\nStatus: owner approved\nNo funds moved.`,
      };
  }
}

async function aiContent(
  action: AgentAction,
  mission: Mission,
  previousArtifacts: ToolArtifact[],
  complete: ChatCompletion,
): Promise<{ summary: string; content: string; provider: ToolArtifact["provider"] }> {
  if (action.kind !== "research" && action.kind !== "draft") {
    return deterministicContent(action, mission, previousArtifacts);
  }

  const context = previousArtifacts
    .map((artifact) => `${artifact.title}: ${artifact.content}`)
    .join("\n\n")
    .slice(0, 5000);
  const content = await complete(`You are ${action.agent}, an execution agent inside a governed one-person company runtime.
Mission: ${mission.objective}
Stakeholder: ${mission.customer}
Deadline: ${mission.deadline}
Current action: ${action.title}
Instruction: ${action.description}
Prior artifacts: ${context || "None"}

Produce a practical artifact in plain text. Stay within the action scope. Do not claim to send messages, spend funds, or make commitments.`);

  return {
    provider: "puter-ai",
    summary: content.replace(/\s+/g, " ").trim().slice(0, 150),
    content: content.trim(),
  };
}

async function executeTool(
  action: AgentAction,
  mission: Mission,
  mode: PlannerMode,
  previousArtifacts: ToolArtifact[],
  complete: ChatCompletion = puterChat,
): Promise<ToolArtifact> {
  const result = mode === "live-ai"
    ? await aiContent(action, mission, previousArtifacts, complete)
    : deterministicContent(action, mission, previousArtifacts);
  const fingerprint = await sha256(
    canonicalize({
      actionId: action.id,
      content: result.content,
      missionId: mission.id,
      toolName: action.toolName,
    }),
  );

  return {
    id: `artifact_${fingerprint.slice(0, 18)}`,
    missionId: mission.id,
    actionId: action.id,
    toolName: action.toolName,
    provider: result.provider,
    title: action.title,
    summary: result.summary,
    content: result.content,
    createdAt: new Date().toISOString(),
  };
}

export class GovernanceError extends Error {
  constructor(
    message: string,
    public readonly evaluation: PolicyEvaluation,
  ) {
    super(message);
    this.name = "GovernanceError";
  }
}

export async function executeGovernedAction({
  action,
  mission,
  mode,
  policies,
  previousArtifacts,
  authorization = "delegated",
  complete = puterChat,
}: {
  action: AgentAction;
  mission: Mission;
  mode: PlannerMode;
  policies: OwnerPolicy[];
  previousArtifacts: ToolArtifact[];
  authorization?: "delegated" | "owner-approved";
  complete?: ChatCompletion;
}): Promise<{ artifact: ToolArtifact; evaluation: PolicyEvaluation }> {
  const evaluation = evaluateAction(action, mission, policies);

  if (evaluation.decision === "block") {
    throw new GovernanceError(
      `Policy blocked ${action.toolName} before invocation.`,
      evaluation,
    );
  }

  if (evaluation.decision === "review" && authorization !== "owner-approved") {
    throw new GovernanceError(
      `Owner approval is required before invoking ${action.toolName}.`,
      evaluation,
    );
  }

  const artifact = await executeTool(
    action,
    mission,
    mode,
    previousArtifacts,
    complete,
  );
  return { artifact, evaluation };
}
