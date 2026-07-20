import assert from "node:assert/strict";
import test from "node:test";

import { demoMission } from "./demo";
import { evaluateAction } from "./policy";
import { planMission } from "./planner";
import { canonicalize, createReceipt, verifyReceiptChain } from "./receipt";
import { executeGovernedAction, GovernanceError } from "./tools";

test("allows routine internal research", () => {
  const action = demoMission.actions.find(
    (candidate) => candidate.id === "action-research",
  );
  assert.ok(action);

  const result = evaluateAction(action, demoMission);

  assert.equal(result.decision, "allow");
  assert.deepEqual(result.matchedPolicyIds, ["policy-routine-work"]);
});

test("requires owner review before an external send", () => {
  const action = demoMission.actions.find(
    (candidate) => candidate.id === "action-send",
  );
  assert.ok(action);

  const result = evaluateAction(action, demoMission);

  assert.equal(result.decision, "review");
  assert.deepEqual(result.matchedPolicyIds, ["policy-owner-approval"]);
});

test("blocks spending above the mission cap", () => {
  const action = demoMission.actions.find(
    (candidate) => candidate.id === "action-over-cap",
  );
  assert.ok(action);

  const result = evaluateAction(action, demoMission);

  assert.equal(result.decision, "block");
  assert.match(result.reasons[0], /exceeds the \$120\.00 mission cap/);
});

test("canonicalization is independent of object key order", () => {
  assert.equal(
    canonicalize({ beta: 2, alpha: { delta: 4, gamma: 3 } }),
    canonicalize({ alpha: { gamma: 3, delta: 4 }, beta: 2 }),
  );
});

test("the same evaluated action produces the same receipt id", async () => {
  const action = demoMission.actions[0];
  const evaluation = evaluateAction(action, demoMission);

  const first = await createReceipt(demoMission, evaluation);
  const second = await createReceipt(demoMission, evaluation);

  assert.equal(first.id, second.id);
  assert.equal(first.canonicalPayload, second.canonicalPayload);
});

test("live planner normalizes model JSON into governed tool calls", async () => {
  const mission = await planMission(
    {
      objective: "Prepare and deliver a customer proposal",
      customer: "Acme",
      source: "CRM brief",
      deadline: "2026-08-01",
      budgetCapUsd: 100,
    },
    "live-ai",
    async () => JSON.stringify({
      title: "Prepare Acme proposal",
      actions: [
        { agent: "Scout", title: "Research", description: "Find context", kind: "research" },
        { agent: "Planner", title: "Draft", description: "Write scope", kind: "draft" },
        { agent: "Closer", title: "Send", description: "Deliver", kind: "external-send", destination: "acme@example.com" },
      ],
    }),
  );

  assert.equal(mission.planSource, "live-ai");
  assert.equal(mission.executionMode, "online");
  assert.equal(mission.actions[0].toolName, "web.search");
  assert.equal(mission.actions[2].toolName, "outbox.send");
});

test("tool adapter refuses a reviewed action without owner authorization", async () => {
  const action = demoMission.actions.find((candidate) => candidate.id === "action-send");
  assert.ok(action);

  await assert.rejects(
    executeGovernedAction({
      action,
      mission: demoMission,
      mode: "replay",
      policies: [
        { id: "policy-owner-approval", name: "Owner approval", description: "", enabled: true },
      ],
      previousArtifacts: [],
    }),
    (error: unknown) => error instanceof GovernanceError && /Owner approval/.test(error.message),
  );
});

test("tool adapter fails closed on an over-cap spend", async () => {
  const action = demoMission.actions.find((candidate) => candidate.id === "action-over-cap");
  assert.ok(action);

  await assert.rejects(
    executeGovernedAction({
      action,
      mission: demoMission,
      mode: "replay",
      policies: [
        { id: "policy-budget-cap", name: "Budget", description: "", enabled: true },
      ],
      previousArtifacts: [],
      authorization: "owner-approved",
    }),
    (error: unknown) => error instanceof GovernanceError && /Policy blocked/.test(error.message),
  );
});

test("owner authorization releases a reviewed sandbox tool", async () => {
  const action = demoMission.actions.find((candidate) => candidate.id === "action-send");
  assert.ok(action);
  const { artifact } = await executeGovernedAction({
    action,
    mission: demoMission,
    mode: "replay",
    policies: [
      { id: "policy-owner-approval", name: "Owner approval", description: "", enabled: true },
    ],
    previousArtifacts: [],
    authorization: "owner-approved",
  });

  assert.equal(artifact.provider, "sandbox");
  assert.match(artifact.content, /No live message was sent/);
});

test("online research seals provider evidence into the artifact", async () => {
  const action = { ...demoMission.actions[0], toolName: "web.search" as const };
  const mission = {
    ...demoMission,
    executionMode: "online" as const,
    planSource: "live-ai" as const,
    actions: [action],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("/api/attestations/verify")) {
      return new Response(JSON.stringify({ valid: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      provider: "online-research",
      requestId: "research_test",
      summary: "Retrieved one live source.",
      content: "LIVE RESEARCH EVIDENCE",
      executedAt: "2026-07-20T00:00:00.000Z",
      externalReference: "https://example.com/evidence",
      evidence: [{ title: "Evidence", url: "https://example.com/evidence", source: "Test" }],
      attestation: "sp_hmac_test",
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const { artifact } = await executeGovernedAction({
      action,
      mission,
      mode: "live-ai",
      policies: [],
      previousArtifacts: [],
    });
    assert.equal(artifact.provider, "online-research");
    assert.equal(artifact.requestId, "research_test");
    assert.equal(artifact.evidence?.[0].source, "Test");
    assert.equal(artifact.attestation, "sp_hmac_test");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("receipt verification detects a broken chain", async () => {
  const firstAction = demoMission.actions[0];
  const secondAction = demoMission.actions[1];
  const first = await createReceipt(
    demoMission,
    evaluateAction(firstAction, demoMission),
    "delegated",
    null,
    1,
  );
  const second = await createReceipt(
    demoMission,
    evaluateAction(secondAction, demoMission),
    "delegated",
    first.id,
    2,
  );

  assert.deepEqual(await verifyReceiptChain([first, second]), { valid: true, checked: 2 });
  const tampered = { ...second, previousReceiptId: "sp_tampered" };
  const result = await verifyReceiptChain([first, tampered]);
  assert.equal(result.valid, false);
  assert.match(result.error ?? "", /chain link mismatch/);
});
