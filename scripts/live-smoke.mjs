import assert from "node:assert/strict";

const baseUrl = (process.env.SOLEPILOT_BASE_URL || "https://solepilot.vercel.app").replace(/\/$/, "");

async function json(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => null);
  return { payload, response };
}

function post(body) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

console.log(`SolePilot live proof: ${baseUrl}`);

const { payload: health, response: healthResponse } = await json("/api/health");
assert.equal(healthResponse.status, 200, "health endpoint must respond");
assert.equal(health.online, true, "online runtime must be available");
assert.equal(health.planner, true, "planner must be available");
assert.equal(health.research, true, "research adapter must be available");
assert.equal(health.attestation, true, "attestation boundary must be configured");

const missionDraft = {
  objective: "Research autonomous agent governance and prepare an owner-approved briefing",
  customer: "BUIDL_QUESTS reviewers",
  source: "Public web evidence",
  deadline: "2026-08-12",
  budgetCapUsd: 120,
  missionType: "work",
};

const { payload: mission, response: planResponse } = await json(
  "/api/plans",
  post(missionDraft),
);
assert.equal(planResponse.status, 200, "planner must return a mission");
assert.equal(mission.executionMode, "online", "mission must use the online execution surface");
assert.ok(Array.isArray(mission.actions) && mission.actions.length >= 3, "planner must return typed actions");

const researchAction = mission.actions.find((action) => action.toolName === "web.search");
const reviewAction = mission.actions.find((action) => action.toolName === "outbox.send");
assert.ok(researchAction, "plan must include governed online research");
assert.ok(reviewAction, "plan must include an external delivery boundary");

const { payload: research, response: researchResponse } = await json(
  "/api/tools/research",
  post({
    actionId: researchAction.id,
    customer: mission.customer,
    missionId: mission.id,
    objective: mission.objective,
  }),
);
assert.equal(researchResponse.status, 200, "research adapter must execute");
assert.ok(research.requestId?.startsWith("research_"), "research must return a provider request id");
assert.ok(research.attestation, "research must return an attestation");
assert.ok(research.evidence?.length > 0, "research must return external evidence URLs");

const { attestation, ...attestedResult } = research;
const { payload: verification, response: verificationResponse } = await json(
  "/api/attestations/verify",
  post({ attestation, result: attestedResult }),
);
assert.equal(verificationResponse.status, 200, "attestation verifier must respond");
assert.equal(verification.valid, true, "server result attestation must verify");

const invalidPayment = {
  objective: "Attempt an over-cap transfer",
  customer: "Boundary test vendor",
  source: "Owner-entered payment instruction",
  deadline: "2026-08-12",
  budgetCapUsd: 0.01,
  missionType: "payment",
  payment: {
    payeeName: "Boundary test vendor",
    scheme: "native-transfer",
    network: "solana-devnet",
    asset: "SOL",
    amount: 0.02,
    maxAmount: 0.01,
    payTo: "11111111111111111111111111111111",
    purpose: "Prove the server rejects an owner-entered payment above its cap",
    requirements: "Recipient and amount must match; owner wallet signature required.",
  },
};
const { payload: blockedPayment, response: blockedPaymentResponse } = await json(
  "/api/plans",
  post(invalidPayment),
);
assert.equal(blockedPaymentResponse.status, 400, "over-cap payment intent must fail closed");
assert.match(blockedPayment.error, /cannot exceed/i, "failure must explain the violated cap");

console.log(JSON.stringify({
  result: "PASS",
  runtime: health,
  onlineMission: {
    id: mission.id,
    planner: mission.plannerModel,
    typedActions: mission.actions.length,
    externalBoundary: reviewAction.toolName,
  },
  liveResearch: {
    provider: research.provider,
    requestId: research.requestId,
    evidence: research.evidence.map((item) => item.url),
    attestationVerified: verification.valid,
  },
  failClosed: {
    status: blockedPaymentResponse.status,
    error: blockedPayment.error,
  },
}, null, 2));
