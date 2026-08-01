# Brand — SolePilot

_Status: active_

## Position

SolePilot is the authority layer for one-person companies: agents can execute
delegated work, but they cannot grant themselves permission to spend, send, or
commit the owner.

## Product promise

**Let agents operate. Never let them grant themselves authority.**

The product should feel like a calm, inspectable operations console. It is not
a chatbot and should never resemble a generic AI assistant.

## Visual system

| Role | Token | Value |
| --- | --- | --- |
| Navigation paper | `--sidebar` | `#F8FAF8` |
| Control-room paper | `--bg` | `#EEF2EF` |
| Primary surface | `--surface` | `#FBFDFB` |
| Authority green | `--primary` | `#0D7850` |
| Live signal | brand mark | `#5DE0A7` |
| Owner review | `--amber` | `#8A5A12` |
| Fail closed | `--red` | `#A3342B` |
| External evidence | `--blue` | `#265D97` |

Green means delegated authority or verified state. Amber means the runtime is
waiting for an owner decision. Red means the action did not execute. Blue is
reserved for external providers and evidence links.

## Typography

- UI and narrative: Geist Sans
- IDs, hashes, policies, runtime state, and timestamps: Geist Mono
- Headings use sentence case and zero letter spacing.
- Numbers and hashes use tabular or monospaced figures.

## Shape and motion

- Six-pixel radii communicate precision without looking hostile.
- Status chips may be pill-shaped; general commands stay compact rectangles.
- Motion is short and functional: selection, state transitions, and proof
  expansion. No decorative ambient animation.

## Voice

Specific, restrained, and technically honest.

- Say `Blocked before tool invocation`, not `Your transaction is safe`.
- Say `Replay`, `Online adapter`, and `Devnet` wherever those boundaries matter.
- Separate implemented proof from the production replacement plan.
- Never imply custody, mainnet readiness, or model autonomy beyond what the
  running build demonstrates.
