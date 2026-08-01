# SolePilot security review

This document describes the security boundary of the competition build. It is
a maintainer security review, not an independent audit.

## Protected assets

- Owner authority over consequential actions
- Mission budget, destination, and payment constraints
- Connector credentials and fixed Telegram destination
- Approval capabilities and action integrity
- Receipt ordering and artifact integrity

## Enforced invariants

1. **Model output is untrusted.** Planner output must pass schema normalization
   and deterministic policy before a tool can run.
2. **Policy is checked twice.** `executeGovernedAction` evaluates the action at
   the tool boundary even when the UI has already displayed a decision.
3. **Approval is action-bound.** A reviewed action requires a short-lived,
   single-use capability bound to its mission, normalized action, policy result,
   and nonce.
4. **Blocked actions fail before invocation.** A connector cannot turn a
   `BLOCK` decision into a side effect.
5. **Wallets remain non-custodial.** SolePilot constructs and inspects a payment
   intent; the user's wallet signs and submits the exact Devnet transaction.
6. **Terminal outcomes are hash-linked.** Receipts commit to the previous
   receipt, canonical action data, policy decision, capability, artifact digest,
   and outcome.
7. **Secrets stay server-side.** Research attestation secrets, Telegram bot
   credentials, destination IDs, and owner connector codes are not returned to
   the browser.

## Threat and regression matrix

| Threat | Expected result | Coverage |
| --- | --- | --- |
| Spend exceeds mission cap | Block before wallet or connector invocation | Automated test + live smoke |
| Approved action is mutated | Capability mismatch, fail closed | Automated test |
| Capability is replayed | Second use rejected | Automated test |
| Capability is expired | Execution rejected | Automated test |
| Tool adapter is called directly | Policy and capability checks still apply | Automated test |
| Payment recipient or amount changes | Intent verification fails | Automated test |
| Unsigned transfer is presented as settled | Settlement rejected | Automated test |
| Research evidence is changed | Attestation verification fails | Automated test |
| Receipt payload is changed | Chain verification fails | Automated test |

Run the reproducible checks:

```bash
npm test
npm run typecheck
npm run build
npm run smoke:live
```

## Current limitations

- Browser persistence is local-first and intended for a single operator. It is
  not tenant-isolated production storage.
- Owner review uses an in-session capability rather than passkey-backed remote
  approval.
- Solana payments are Devnet-only in this build.
- Server attestations prove that the configured SolePilot server produced an
  artifact; they do not make an external provider's underlying claims true.
- The application has not received an independent smart-contract or application
  security audit.

## Production hardening plan

1. Add authenticated tenant storage with encrypted mission and receipt data.
2. Bind approvals to passkeys or organization policy signers.
3. Move capability consumption to an atomic server-side store.
4. Add provider-specific idempotency keys and durable delivery reconciliation.
5. Introduce audited mainnet payment adapters and transaction simulation.
6. Publish signed release manifests and externally reproducible security tests.

Security reports should avoid public disclosure of active secrets or exploitable
production details. Open a private GitHub security advisory for sensitive issues.
