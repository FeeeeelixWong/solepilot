# SolePilot Architecture

## Product boundary

SolePilot is the multi-mission authority layer between agent planners and
business tools.
It does not treat model output as authorization. Model-generated actions are
untrusted proposals until they pass schema normalization and policy evaluation.

The public competition build has two execution surfaces. Replay is a client-side
reference runtime that any judge can run without credentials. Online work uses
same-origin Next.js route handlers for live research, deterministic proposal
composition, and an owner-approved email handoff that does not send
automatically. A fixed-destination Telegram connector remains available as an
optional proof adapter; the server keeps its credentials and destination out of
model and browser contexts. Solana payment missions use a separate,
non-custodial client connector: the normalized payment intent is reviewed by
policy first, and only the owner's wallet extension can sign the resulting
Devnet transaction.

## Execution sequence

1. The owner supplies an objective, stakeholder, public source, optional contact, and deadline.
2. Replay or the same-origin server planner returns a typed `AgentAction[]` plan.
3. The normalizer accepts only known action kinds and maps each kind to an
   allow-listed tool.
4. `evaluateAction` returns `allow`, `review`, or `block` with matched policy IDs.
5. `executeGovernedAction` evaluates policy again at the tool boundary.
6. Reviewed actions require a one-time capability bound to the mission, action
   digest, policy result, nonce, and five-minute expiry.
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
- Server-side research and attestation boundary
- Local owner-controlled email handoff
- Optional server-side fixed-destination connector

An optional AI provider cannot choose a tool outside the allow-list and cannot
override a policy result. Owner approval can release `review` actions but cannot
override `block` actions.

## Receipt construction

Each receipt canonicalizes and hashes:

- mission ID, objective, budget cap, and planner source
- full typed action
- policy decision, reasons, and matched policy IDs
- approval capability ID for owner-released actions
- terminal outcome: delegated, approved, rejected, or blocked
- digest of the tool artifact, when a tool ran
- receipt sequence and previous receipt ID

`createdAt` is metadata and is deliberately excluded from the digest, allowing
the same governed input to produce the same receipt ID. The previous receipt ID
turns individual receipts into an ordered tamper-evident chain.

## Workspace persistence

The control plane saves multiple independent runtimes in a versioned browser
workspace. Each runtime contains its mission, policies, statuses, artifacts,
trace, and ledger. The migration layer upgrades the previous single-runtime
schema and the original Solana-specific payment shape. Online tool execution
happens on the server, but the workspace remains local-first and resumable.
Receipt verification must still be used before trusting restored data.

Approval capabilities are deliberately not persisted. A refreshed or resumed
review must receive a fresh owner decision.

## Approval capability boundary

Owner approval does not pass a reusable boolean or role string to a connector.
SolePilot creates a short-lived capability whose digest commits to the full
action, mission constraints, and current policy evaluation. The governed tool
adapter verifies and consumes that capability before invoking the external
provider. Reuse, expiry, action changes, mission changes, and policy-result
changes all fail closed.

## Online connector boundary

`POST /api/plans` validates bounded mission input and returns a typed online
plan from the reliable server planner. It requires no browser popup, external
account, or model credential. An optional model planner can still be injected
behind the same normalizer without changing policy semantics. The default
customer-work planner proposes only research, proposal composition, and the
owner-controlled handoff. Replay retains spending and the deterministic
over-cap case for policy stress testing.

`POST /api/tools/research` accepts bounded mission context, validates that an
owner-supplied URL resolves to public network addresses, reads bounded HTML or
plain text, queries additional public sources, labels all returned text as
untrusted evidence, and returns source URLs plus a signed execution result. The browser verifies that result through
`POST /api/attestations/verify` before accepting it as a tool artifact.

The default `outbox.send` adapter creates a local handoff artifact containing
the approved proposal, recipient, and subject. The owner may copy, download, or
open that artifact in an email client. SolePilot never submits the email.

`POST /api/tools/telegram` requires the owner connector code, accepts only a
completed artifact, and sends to the server-configured chat. Callers cannot
select an arbitrary recipient. The response includes Telegram's message ID and
provider timestamp before it is attested and sealed into the receipt chain.

## Solana payment boundary

A payment mission starts with owner-entered structured fields rather than a
free-form model prompt: scheme, network, asset, payee, recipient, amount,
maximum amount, optional resource, purpose, deadline, and requirements.
The server validates the address and numeric bounds before returning a plan.

The planner copies the scheme, recipient, amount, asset, network, resource,
purpose, and requirements into the typed `wallet.transfer` action.
`policy-payment-intent` compares that action
with the sealed mission intent and fails closed if any protected field changes
or the payment deadline has expired.
`policy-budget-cap` rejects amounts above the owner cap, and
`policy-owner-approval` pauses every valid payment before invocation.

After capability approval, the payment registry resolves the matching adapter.
The current browser adapter connects to
OKX Wallet or a compatible Phantom-style provider, builds a System Program SOL
transfer, and requests the wallet signature. SolePilot never handles the seed
phrase or private key. The adapter waits for Devnet confirmation and records
the sender, recipient, amount, transaction signature, and Explorer URL as the
tool artifact sealed into the receipt chain.

## Production replacement plan

The reference interfaces are intentionally narrow so production systems can
replace adapters without changing policy semantics:

| Reference component | Production replacement |
| --- | --- |
| Browser multi-mission workspace | Encrypted workspace database with tenant isolation |
| Reliable server planner | Organization-managed model gateway with schema-constrained output |
| Owner-controlled email handoff | Email/CRM connectors with per-tenant scoped OAuth |
| Solana Devnet wallet adapter | Production network adapter with transaction simulation, allow-listed assets, and per-transaction authorization |
| Browser-issued action capability | Passkey-signed approval capability |
| SHA-256 receipt chain | Signed append-only log with external timestamp anchor |

Production connectors must receive only the normalized action and a short-lived
authorization capability. They must never receive an owner private key or a
general-purpose credential from the model context.

## Known limitations

- Persistence is device-local rather than synchronized across owner devices.
- Receipts are hash-linked and online results are server-attested. Approval
  capabilities are action-bound and single-use, but are not yet passkey-signed.
- Telegram is a fixed-destination proof connector, not a multi-tenant outbox.
- The payment schema and registry are chain-neutral, but the only executable
  adapter is currently Solana Devnet. It moves only test SOL after a wallet
  prompt and is not a mainnet payment product.
- The default planner and evidence-backed draft are deterministic; model-driven
  synthesis is an optional production adapter rather than a demo dependency.

These are explicit deployment boundaries, not hidden simulated behavior.
