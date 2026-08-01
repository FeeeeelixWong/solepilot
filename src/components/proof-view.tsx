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
    label: "You set the goal",
    detail: "Outcome, limit, deadline",
    trust: "your instruction",
  },
  {
    label: "AI proposes work",
    detail: "A clear action plan",
    trust: "not yet authorized",
  },
  {
    label: "Rules check it",
    detail: "Continue, ask, or stop",
    trust: "predictable",
  },
  {
    label: "You approve impact",
    detail: "Messages, spend, commitments",
    trust: "owner controlled",
  },
  {
    label: "Outcome is recorded",
    detail: "A checkable activity history",
    trust: "auditable",
  },
];

const guarantees = [
  {
    icon: LockKeyhole,
    title: "AI cannot approve itself.",
    copy: "Every proposed action is checked against your rules before a connected tool can run.",
  },
  {
    icon: KeyRound,
    title: "An approval works only once.",
    copy: "Your approval applies to one exact action for a short time. It cannot be reused elsewhere.",
  },
  {
    icon: WalletCards,
    title: "Your wallet stays with you.",
    copy: "SolePilot checks a payment first; your wallet signs the exact Solana transfer.",
  },
  {
    icon: ReceiptText,
    title: "Every outcome can be checked.",
    copy: "Completed, approved, rejected, and stopped actions all leave a tamper-evident record.",
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
          <p className="eyebrow">HOW SOLEPILOT KEEPS YOU IN CONTROL</p>
          <h2>Your AI team can do the work.<br />Only you can authorize the consequences.</h2>
          <p>
            Routine work moves automatically. Messages, spending, and commitments pause for
            your decision. Anything outside your rules stops before it reaches a real tool.
          </p>
          <div className="proof-hero-actions">
            <button className="button primary" onClick={onStartDemo} type="button">
              <Play aria-hidden="true" size={16} />
              Try the complete example
            </button>
            <a className="button secondary" href={repository} rel="noreferrer" target="_blank">
              <Github aria-hidden="true" size={16} />
              Source
              <ExternalLink aria-hidden="true" size={12} />
            </a>
          </div>
        </div>

        <div className="proof-runtime" aria-label="System status">
          <div className="proof-runtime-heading">
            <span><Radio aria-hidden="true" size={15} /> System status</span>
            <code>{runtimeHealth?.version ?? "checking"}</code>
          </div>
          <StatusSignal label="AI task planning" ready={runtimeHealth?.planner} resolved={runtimeHealth !== null} />
          <StatusSignal label="Online research" ready={runtimeHealth?.research} resolved={runtimeHealth !== null} />
          <StatusSignal label="Owner notifications" ready={runtimeHealth?.telegram} resolved={runtimeHealth !== null} />
          <StatusSignal label="Verified activity records" ready={runtimeHealth?.attestation} resolved={runtimeHealth !== null} />
          <div className="proof-runtime-foot">
            <Cloud aria-hidden="true" size={14} />
            <span>Connection credentials stay on the server. The AI never sees them.</span>
          </div>
        </div>
      </header>

      <div className="proof-section-heading">
        <div>
          <p className="eyebrow">FROM GOAL TO SAFE OUTCOME</p>
          <h3>Five steps keep responsibility clear.</h3>
        </div>
        <span><Fingerprint aria-hidden="true" size={15} /> rules run before tools</span>
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
            <p className="eyebrow">COMPLETE EXAMPLE</p>
            <h3>See control happen, not just a promise.</h3>
          </div>
          <strong>{receiptCount} records in the current task</strong>
        </div>
        <ol>
          <li><span>01</span><p><b>Start</b> a ready-made task and watch routine research complete automatically.</p></li>
          <li><span>02</span><p><b>Decide</b> whether the AI may send the prepared external message.</p></li>
          <li><span>03</span><p><b>See</b> an action outside the spending limit stop before any tool can run.</p></li>
          <li><span>04</span><p><b>Check</b> the activity history and inspect the technical proof when needed.</p></li>
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
        <p><b>Current product boundary.</b> Preview mode is sandboxed. Online research and Telegram delivery use live server connections. Solana payment is non-custodial and uses Devnet in this competition build.</p>
      </div>
    </section>
  );
}
