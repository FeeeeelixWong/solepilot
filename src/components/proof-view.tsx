import {
  ArrowRight,
  Check,
  CircleDot,
  Cloud,
  ExternalLink,
  Fingerprint,
  Github,
  KeyRound,
  LockKeyhole,
  Play,
  Radio,
  ReceiptText,
  ShieldCheck,
  WalletCards,
} from "lucide-react";

import type { RuntimeHealth } from "@/lib/online";

const architecture = [
  {
    label: "Owner mandate",
    detail: "Objective, budget, deadline",
    trust: "trusted input",
  },
  {
    label: "Agent proposal",
    detail: "Typed tool calls only",
    trust: "untrusted",
  },
  {
    label: "Policy gate",
    detail: "Allow, review, or block",
    trust: "deterministic",
  },
  {
    label: "Tool boundary",
    detail: "Capability checked again",
    trust: "enforced",
  },
  {
    label: "Receipt proof",
    detail: "Hash-linked outcome",
    trust: "verifiable",
  },
];

const guarantees = [
  {
    icon: LockKeyhole,
    title: "Models propose. They never authorize.",
    copy: "Every generated action is normalized and evaluated before any connector can run.",
  },
  {
    icon: KeyRound,
    title: "Approval is action-bound.",
    copy: "A five-minute, single-use capability commits to the mission, action, and policy result.",
  },
  {
    icon: WalletCards,
    title: "The owner remains the signer.",
    copy: "Payment intents pass policy first; the wallet extension signs the exact Solana transfer.",
  },
  {
    icon: ReceiptText,
    title: "Every outcome leaves evidence.",
    copy: "Policy decisions, tool artifacts, capabilities, and previous hashes are sealed together.",
  },
];

const repository = "https://github.com/FeeeeelixWong/solepilot";

function StatusSignal({
  label,
  ready,
  resolved,
}: {
  label: string;
  ready?: boolean;
  resolved: boolean;
}) {
  const state = !resolved ? "checking" : ready ? "live" : "disabled";

  return (
    <div className="proof-signal" data-state={state}>
      <span className="proof-signal-icon" aria-hidden="true">
        {ready ? <Check size={13} /> : <CircleDot size={13} />}
      </span>
      <span>{label}</span>
      <strong>{state.toUpperCase()}</strong>
    </div>
  );
}

export function ProofView({
  onStartDemo,
  receiptCount,
  runtimeHealth,
}: {
  onStartDemo: () => void;
  receiptCount: number;
  runtimeHealth: RuntimeHealth | null;
}) {
  return (
    <section className="proof-view">
      <header className="proof-hero">
        <div className="proof-hero-copy">
          <p className="eyebrow">SOLEPILOT / VERIFIABLE AUTHORITY LAYER</p>
          <h2>Let agents operate.<br />Never let them grant themselves authority.</h2>
          <p>
            SolePilot turns model output into governed business execution for one-person
            companies. Routine work proceeds, consequential actions pause, violations stop
            before invocation, and every terminal outcome becomes inspectable evidence.
          </p>
          <div className="proof-hero-actions">
            <button className="button primary" onClick={onStartDemo} type="button">
              <Play aria-hidden="true" size={16} />
              Start 90-second proof
            </button>
            <a className="button secondary" href={repository} rel="noreferrer" target="_blank">
              <Github aria-hidden="true" size={16} />
              Source
              <ExternalLink aria-hidden="true" size={12} />
            </a>
          </div>
        </div>

        <div className="proof-runtime" aria-label="Live runtime status">
          <div className="proof-runtime-heading">
            <span><Radio aria-hidden="true" size={15} /> Live system proof</span>
            <code>{runtimeHealth?.version ?? "checking"}</code>
          </div>
          <StatusSignal label="Same-origin planner API" ready={runtimeHealth?.planner} resolved={runtimeHealth !== null} />
          <StatusSignal label="External research adapter" ready={runtimeHealth?.research} resolved={runtimeHealth !== null} />
          <StatusSignal label="Owner Telegram connector" ready={runtimeHealth?.telegram} resolved={runtimeHealth !== null} />
          <StatusSignal label="HMAC result attestation" ready={runtimeHealth?.attestation} resolved={runtimeHealth !== null} />
          <div className="proof-runtime-foot">
            <Cloud aria-hidden="true" size={14} />
            <span>Credentials remain server-side. The model never sees connector secrets.</span>
          </div>
        </div>
      </header>

      <div className="proof-section-heading">
        <div>
          <p className="eyebrow">EXECUTION BOUNDARY</p>
          <h3>One action. Five explicit trust transitions.</h3>
        </div>
        <span><Fingerprint aria-hidden="true" size={15} /> policy before tool invocation</span>
      </div>

      <div className="architecture-rail" aria-label="SolePilot execution architecture">
        {architecture.map((step, index) => (
          <div className="architecture-step" key={step.label}>
            <span className="architecture-index">{String(index + 1).padStart(2, "0")}</span>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
            <code>{step.trust}</code>
            {index < architecture.length - 1 ? <ArrowRight aria-hidden="true" size={16} /> : null}
          </div>
        ))}
      </div>

      <div className="guarantee-grid">
        {guarantees.map((guarantee) => {
          const Icon = guarantee.icon;
          return (
            <article className="guarantee-item" key={guarantee.title}>
              <Icon aria-hidden="true" size={19} />
              <h3>{guarantee.title}</h3>
              <p>{guarantee.copy}</p>
            </article>
          );
        })}
      </div>

      <div className="judge-proof">
        <div className="judge-proof-heading">
          <div>
            <p className="eyebrow">JUDGE PATH</p>
            <h3>Reproduce the core claim without credentials.</h3>
          </div>
          <strong>{receiptCount} receipts in the active mission</strong>
        </div>
        <ol>
          <li><span>01</span><p><b>Run</b> the reference mission and watch routine research execute automatically.</p></li>
          <li><span>02</span><p><b>Approve or reject</b> the paused external action at the owner boundary.</p></li>
          <li><span>03</span><p><b>Observe</b> the over-cap action fail before the tool adapter can invoke it.</p></li>
          <li><span>04</span><p><b>Verify</b> the hash-linked ledger and inspect each canonical receipt payload.</p></li>
        </ol>
        <div className="evidence-links">
          <a href="/api/health" rel="noreferrer" target="_blank">
            Runtime health <ExternalLink size={12} />
          </a>
          <a href={`${repository}/blob/main/EVIDENCE.md`} rel="noreferrer" target="_blank">
            Evidence map <ExternalLink size={12} />
          </a>
          <a href={`${repository}/blob/main/ARCHITECTURE.md`} rel="noreferrer" target="_blank">
            Trust boundaries <ExternalLink size={12} />
          </a>
          <a href={`${repository}/actions`} rel="noreferrer" target="_blank">
            Test runs <ExternalLink size={12} />
          </a>
        </div>
      </div>

      <div className="proof-boundary-note">
        <ShieldCheck aria-hidden="true" size={17} />
        <p><b>Honest deployment boundary.</b> Replay is deterministic and sandboxed. Online research and Telegram delivery use real server adapters. Solana payment is non-custodial and Devnet-only in this competition build.</p>
      </div>
    </section>
  );
}
