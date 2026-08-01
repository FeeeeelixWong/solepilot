# SolePilot evidence map

This document maps every competition claim to a reproducible artifact. It also
labels the deployment boundary so reviewers can distinguish live integrations,
deterministic proofs, wallet-dependent flows, and production plans.

## Proof levels

- **LIVE** — executes against the deployed Vercel runtime or an external provider.
- **DETERMINISTIC** — runs locally without credentials and produces the same governed result.
- **WALLET** — requires the reviewer's OKX Wallet or Phantom extension and Devnet SOL.
- **PLANNED** — documented production replacement; not presented as implemented.

## Claim-to-proof matrix

| Claim | Level | Reproduce | Inspect |
| --- | --- | --- | --- |
| A server planner returns typed, allow-listed actions | LIVE | `npm run smoke:live` | [`POST /api/plans`](./src/app/api/plans/route.ts) |
| Research retrieves current external evidence | LIVE | `npm run smoke:live` | [`POST /api/tools/research`](./src/app/api/tools/research/route.ts) |
| Online tool results are server-attested and verified | LIVE | `npm run smoke:live` | [attestation boundary](./src/lib/server/attestation.ts) |
| Telegram delivery pauses for an owner code and uses a fixed server destination | LIVE | Run an Online Agent mission in the product | [Telegram route](./src/app/api/tools/telegram/route.ts) |
| Policy runs before connector invocation | DETERMINISTIC | Run the default mission or `npm test` | [`evaluateAction`](./src/lib/policy.ts) and [`executeGovernedAction`](./src/lib/tools.ts) |
| Reviewed actions require an unexpired, single-use, action-bound capability | DETERMINISTIC | `npm test` | [capability implementation](./src/lib/capability.ts) |
| An over-cap action fails closed | LIVE + DETERMINISTIC | `npm run smoke:live` and `npm test` | payment route validation and policy tests |
| Receipt tampering breaks chain verification | DETERMINISTIC | Run the mission, open Ledger, select **Verify chain**; also `npm test` | [receipt implementation](./src/lib/receipt.ts) |
| Solana transfers remain non-custodial | WALLET | Create a Governed payment mission and approve the exact Devnet transfer | [Solana adapter](./src/lib/solana.ts) |
| Mainnet, passkeys, and synchronized tenant storage | PLANNED | Not claimed as implemented | [production replacement plan](./ARCHITECTURE.md#production-replacement-plan) |

## One-command live proof

```bash
npm install
npm run smoke:live
```

The smoke test calls the public deployment and asserts this full sequence:

```text
GET /api/health
  -> POST /api/plans
  -> POST /api/tools/research
  -> POST /api/attestations/verify
  -> POST an invalid over-cap payment intent
  -> assert HTTP 400 and a cap-specific fail-closed error
```

Set `SOLEPILOT_BASE_URL=http://localhost:3000` to run the same proof against a
local server.

## 90-second product proof

1. Open the public product and select **Proof**.
2. Select **Start 90-second proof**.
3. Run the mission. Routine internal work executes automatically.
4. Approve or reject the paused external send.
5. Continue until the over-cap reservation is blocked before invocation.
6. Open **Ledger**, expand a receipt, and inspect the canonical payload.
7. Select **Verify chain**.

## Honest boundary

Replay uses real policy, capability, tool-adapter, artifact, and receipt code,
but sandbox tool outputs. Online Agent uses real same-origin server routes,
live public research sources, HMAC attestations, and an owner-controlled
Telegram connector. Solana payment uses a real wallet prompt and Devnet
transaction path, but this repository does not claim a bundled public payment
signature until a reviewer or owner executes that wallet-dependent flow.
