import type { Mission, MissionDraft } from "./types";

export const demoDraft: MissionDraft = {
  objective:
    "Qualify the opportunity, prepare a scoped proposal, and secure owner approval before making any external commitment.",
  customer: "Northstar Protocol",
  source: "Inbound product brief",
  deadline: "2026-07-24",
  budgetCapUsd: 120,
};

export const demoMission: Mission = {
  id: "mission-bq-001",
  title: "Win a qualified agent infrastructure engagement",
  ...demoDraft,
  status: "ready",
  planSource: "replay",
  executionMode: "sandbox",
  plannerModel: "SolePilot reference planner v1",
  actions: [
    {
      id: "action-research",
      agent: "Scout",
      title: "Research the opportunity",
      description:
        "Summarize the customer's product, technical surface, and likely buying criteria.",
      kind: "research",
      toolName: "workspace.search",
    },
    {
      id: "action-scope",
      agent: "Planner",
      title: "Draft delivery scope",
      description:
        "Produce a seven-day plan with acceptance criteria and explicit exclusions.",
      kind: "draft",
      toolName: "document.compose",
    },
    {
      id: "action-send",
      agent: "Closer",
      title: "Send the proposal",
      description:
        "Send the approved scope and commercial terms to the customer contact.",
      kind: "external-send",
      toolName: "outbox.send",
      destination: "founder@northstar.example",
    },
    {
      id: "action-tools",
      agent: "Operator",
      title: "Purchase an API evaluation pack",
      description:
        "Reserve the API credits required to validate the customer's integration.",
      kind: "spend",
      toolName: "wallet.reserve",
      amountUsd: 48,
      destination: "API vendor sandbox",
    },
    {
      id: "action-over-cap",
      agent: "Operator",
      title: "Upgrade to an enterprise data plan",
      description:
        "Attempt to reserve a larger data package without changing the mission budget.",
      kind: "spend",
      toolName: "wallet.reserve",
      amountUsd: 240,
      destination: "Data vendor sandbox",
    },
  ],
};
