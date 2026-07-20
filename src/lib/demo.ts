import type { Mission } from "./types";

export const demoMission: Mission = {
  id: "mission-bq-001",
  title: "Win a qualified agent infrastructure engagement",
  customer: "Northstar Protocol",
  source: "Inbound product brief",
  objective:
    "Qualify the opportunity, prepare a scoped proposal, and secure owner approval before making any external commitment.",
  deadline: "2026-07-24",
  budgetCapUsd: 120,
  status: "ready",
  actions: [
    {
      id: "action-research",
      agent: "Scout",
      title: "Research the opportunity",
      description:
        "Summarize the customer's product, technical surface, and likely buying criteria.",
      kind: "research",
    },
    {
      id: "action-scope",
      agent: "Planner",
      title: "Draft delivery scope",
      description:
        "Produce a seven-day plan with acceptance criteria and explicit exclusions.",
      kind: "draft",
    },
    {
      id: "action-send",
      agent: "Closer",
      title: "Send the proposal",
      description:
        "Send the approved scope and commercial terms to the customer contact.",
      kind: "external-send",
      destination: "founder@northstar.example",
    },
    {
      id: "action-tools",
      agent: "Operator",
      title: "Purchase an API evaluation pack",
      description:
        "Buy the API credits required to validate the customer's integration.",
      kind: "spend",
      amountUsd: 48,
      destination: "API vendor",
    },
  ],
};
