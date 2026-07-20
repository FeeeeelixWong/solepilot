# SolePilot Architecture

## Product boundary

SolePilot is the authority layer between an agent planner and business tools.
It does not treat model output as authorization. Model-generated actions are
untrusted proposals until they pass schema normalization and policy evaluation.

The public competition build has two execution surfaces. Replay is a client-side
reference runtime that any judge can run without credentials. Online Agent uses
same-origin Next.js route handlers for live research and owner-approved Telegram
delivery. The server keeps provider credentials and the fixed destination out
of model and browser contexts.

## Execution sequence

1. The owner supplies an objective, stakeholder, deadline, and budget cap.
2. Replay or Live AI returns a typed `AgentAction[]` plan.
3. The normalizer accepts only known action kinds and maps each kind to an
   allow-listed tool.
4. `evaluateAction` returns `allow`, `review`, or `block` with matched policy IDs.
5. `executeGovernedAction` evaluates policy again at the tool boundary.
6. Reviewed actions require the explicit `owner-approved` capability.
7. A successful adapter call returns a `ToolArtifact`. Online artifacts include
   provider request IDs, external references, and an HMAC attestation.
8. The runtime commits the policy decision, final outcome, artifact digest, and
   previous receipt ID into the next receipt.

## Trust boundaries

### Untrusted

- Owner-supplied mission text
- Model-generated titles, descriptions, destinations, and amounts
- External research text and every connector response
- Restored browser state before receipt verification

### Trusted reference components

- Action schema normalizer
- Deterministic policy engine
- Governed tool adapter
- Canonical serializer and SHA-256 receipt builder
- Receipt-chain verifier
- Server-side fixed-destination connector and result attestation boundary

The Live AI provider cannot choose a tool outside the allow-list and cannot
override a policy result. Owner approval can release `review` actions but cannot
override `block` actions.

## Receipt construction

Each receipt canonicalizes and hashes:

- mission ID, objective, budget cap, and planner source
- full typed action
- policy decision, reasons, and matched policy IDs
- terminal outcome: delegated, approved, rejected, or blocked
- digest of the tool artifact, when a tool ran
- receipt sequence and previous receipt ID

`createdAt` is metadata and is deliberately excluded from the digest, allowing
the same governed input to produce the same receipt ID. The previous receipt ID
turns individual receipts into an ordered tamper-evident chain.

## Persistence

The current runtime saves its mission, policies, statuses, artifacts, trace, and
ledger in versioned browser local storage. Online tool execution happens on the
server, but the workspace remains local-first and resumable. Receipt verification
must still be used before trusting restored data.

## Online connector boundary

`POST /api/tools/research` accepts bounded mission context, queries allow-listed
public sources, labels returned text as untrusted evidence, and returns source
URLs plus a signed execution result. The browser verifies that result through
`POST /api/attestations/verify` before accepting it as a tool artifact.

`POST /api/tools/telegram` requires the owner connector code, accepts only a
completed artifact, and sends to the server-configured chat. Callers cannot
select an arbitrary recipient. The response includes Telegram's message ID and
provider timestamp before it is attested and sealed into the receipt chain.

## Production replacement plan

The reference interfaces are intentionally narrow so production systems can
replace adapters without changing policy semantics:

| Reference component | Production replacement |
| --- | --- |
| Browser local storage | Encrypted workspace database with tenant isolation |
| Puter user session | Organization-managed model gateway |
| Fixed Telegram outbox | Email/CRM connectors with per-tenant scoped OAuth |
| Sandbox reservation | Payment provider with per-transaction authorization |
| Browser owner approval | Passkey-signed approval capability |
| SHA-256 receipt chain | Signed append-only log with external timestamp anchor |

Production connectors must receive only the normalized action and a short-lived
authorization capability. They must never receive an owner private key or a
general-purpose credential from the model context.

## Known limitations

- Persistence is device-local rather than synchronized across owner devices.
- Receipts are hash-linked and online results are server-attested, but owner
  approvals are not yet passkey-signed.
- Telegram is a fixed-destination proof connector, not a multi-tenant outbox.
- Spending is deliberately non-custodial and does not move funds.
- Live AI availability depends on the user's Puter session and provider quota.

These are explicit deployment boundaries, not hidden simulated behavior.
