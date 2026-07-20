import assert from "node:assert/strict";
import test from "node:test";

import { demoMission } from "./demo";
import { evaluateAction } from "./policy";
import { canonicalize, createReceipt } from "./receipt";

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
