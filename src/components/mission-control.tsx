"use client";

import {
  Activity,
  Bot,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  FileCheck2,
  LockKeyhole,
  Play,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  UserRoundCheck,
  WalletCards,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { demoMission } from "@/lib/demo";
import { evaluateAction, ownerPolicies } from "@/lib/policy";
import { createReceipt } from "@/lib/receipt";
import type {
  ActionReceipt,
  AgentAction,
  Decision,
  OwnerPolicy,
} from "@/lib/types";

type View = "mission" | "policies" | "receipts";
type RuntimeStatus =
  | "pending"
  | "running"
  | "awaiting-owner"
  | "complete"
  | "blocked";

interface RuntimeReceipt extends ActionReceipt {
  resultLabel: string;
}

const initialStatuses = Object.fromEntries(
  demoMission.actions.map((action) => [action.id, "pending"]),
) as Record<string, RuntimeStatus>;

const actionIcons: Record<AgentAction["kind"], typeof Search> = {
  research: Search,
  draft: FileCheck2,
  "external-send": Send,
  "commercial-commitment": UserRoundCheck,
  spend: WalletCards,
};

const navItems: Array<{
  id: View;
  label: string;
  icon: typeof Activity;
}> = [
  { id: "mission", label: "Mission", icon: Activity },
  { id: "policies", label: "Owner policies", icon: ShieldCheck },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
];

const delay = (duration: number) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

function decisionLabel(decision: Decision): string {
  if (decision === "allow") return "Delegated";
  if (decision === "review") return "Owner review";
  return "Blocked";
}

export function MissionControl() {
  const [view, setView] = useState<View>("mission");
  const [statuses, setStatuses] =
    useState<Record<string, RuntimeStatus>>(initialStatuses);
  const [policies, setPolicies] = useState<OwnerPolicy[]>(ownerPolicies);
  const [selectedActionId, setSelectedActionId] = useState(
    demoMission.actions[0].id,
  );
  const [receipts, setReceipts] = useState<RuntimeReceipt[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [announcement, setAnnouncement] = useState(
    "Mission ready. Run the agent plan when you are ready.",
  );

  const evaluations = useMemo(
    () =>
      Object.fromEntries(
        demoMission.actions.map((action) => [
          action.id,
          evaluateAction(action, demoMission, policies),
        ]),
      ),
    [policies],
  );
  const selectedAction =
    demoMission.actions.find((action) => action.id === selectedActionId) ??
    demoMission.actions[0];
  const selectedEvaluation = evaluations[selectedAction.id];
  const waitingAction = demoMission.actions.find(
    (action) => statuses[action.id] === "awaiting-owner",
  );
  const completedCount = Object.values(statuses).filter(
    (status) => status === "complete" || status === "blocked",
  ).length;
  const missionIsComplete = completedCount === demoMission.actions.length;

  async function addReceipt(action: AgentAction, resultLabel: string) {
    const evaluation = evaluations[action.id];
    const receipt = await createReceipt(demoMission, evaluation);
    setReceipts((current) => [
      ...current,
      { ...receipt, resultLabel },
    ]);
  }

  async function runMission() {
    if (isRunning || waitingAction) return;

    setIsRunning(true);
    const localStatuses = { ...statuses };

    for (const action of demoMission.actions) {
      if (localStatuses[action.id] !== "pending") continue;

      const evaluation = evaluations[action.id];
      setSelectedActionId(action.id);
      localStatuses[action.id] = "running";
      setStatuses({ ...localStatuses });
      setAnnouncement(`${action.agent} is evaluating ${action.title}.`);
      await delay(520);

      if (evaluation.decision === "review") {
        localStatuses[action.id] = "awaiting-owner";
        setStatuses({ ...localStatuses });
        setAnnouncement(`${action.title} requires your approval.`);
        setIsRunning(false);
        return;
      }

      if (evaluation.decision === "block") {
        localStatuses[action.id] = "blocked";
        setStatuses({ ...localStatuses });
        await addReceipt(action, "POLICY BLOCK");
        setAnnouncement(`${action.title} was blocked by the budget policy.`);
        await delay(360);
        continue;
      }

      localStatuses[action.id] = "complete";
      setStatuses({ ...localStatuses });
      await addReceipt(action, "DELEGATED ALLOW");
      setAnnouncement(`${action.title} completed within delegated authority.`);
      await delay(360);
    }

    setAnnouncement("Mission complete. Every action has an auditable outcome.");
    setIsRunning(false);
  }

  function resolveOwnerReview(
    actionId: string,
    outcome: "approve" | "reject",
  ) {
    const action = demoMission.actions.find(
      (candidate) => candidate.id === actionId,
    );
    if (!action || statuses[actionId] !== "awaiting-owner") return;

    const status = outcome === "approve" ? "complete" : "blocked";
    setStatuses((current) => ({ ...current, [actionId]: status }));
    setAnnouncement(
      `${action.title} was ${outcome === "approve" ? "approved" : "rejected"} by the owner.`,
    );
    void addReceipt(
      action,
      outcome === "approve" ? "OWNER APPROVED" : "OWNER REJECTED",
    );
  }

  function resetDemo() {
    setStatuses(initialStatuses);
    setReceipts([]);
    setSelectedActionId(demoMission.actions[0].id);
    setAnnouncement("Mission reset. The policy engine is ready.");
    setView("mission");
  }

  function togglePolicy(policyId: string) {
    setPolicies((current) =>
      current.map((policy) =>
        policy.id === policyId
          ? { ...policy, enabled: !policy.enabled }
          : policy,
      ),
    );
    resetDemo();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <Bot size={20} />
          </div>
          <div>
            <p className="brand-name">SolePilot</p>
            <p className="brand-caption">Owner control plane</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="nav-button"
                data-active={view === item.id}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                <span>{item.label}</span>
                {item.id === "receipts" && receipts.length > 0 ? (
                  <span className="nav-count">{receipts.length}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="owner-card">
          <div className="owner-avatar" aria-hidden="true">MH</div>
          <div>
            <p className="owner-name">Mingfeng</p>
            <p className="owner-role">Owner online</p>
          </div>
          <span className="status-dot" title="Connected" />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">ONE-PERSON COMPANY / MISSION 001</p>
            <h1>{view === "mission" ? demoMission.title : navItems.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <button className="button secondary" onClick={resetDemo} type="button">
              <RotateCcw aria-hidden="true" size={16} />
              Reset
            </button>
            {view === "mission" ? (
              <button
                aria-busy={isRunning}
                className="button primary"
                disabled={isRunning || Boolean(waitingAction) || missionIsComplete}
                onClick={runMission}
                type="button"
              >
                {isRunning ? <Clock3 aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
                {isRunning ? "Agents working" : missionIsComplete ? "Mission complete" : "Run mission"}
              </button>
            ) : null}
          </div>
        </header>

        <p className="sr-only" aria-live="polite">{announcement}</p>

        {view === "mission" ? (
          <MissionView
            completedCount={completedCount}
            evaluations={evaluations}
            onResolveReview={resolveOwnerReview}
            onSelect={setSelectedActionId}
            selectedAction={selectedAction}
            statuses={statuses}
            waitingAction={waitingAction}
          />
        ) : null}

        {view === "policies" ? (
          <PoliciesView policies={policies} onToggle={togglePolicy} />
        ) : null}

        {view === "receipts" ? <ReceiptsView receipts={receipts} /> : null}
      </main>
    </div>
  );
}

function MissionView({
  completedCount,
  evaluations,
  onResolveReview,
  onSelect,
  selectedAction,
  statuses,
  waitingAction,
}: {
  completedCount: number;
  evaluations: Record<string, ReturnType<typeof evaluateAction>>;
  onResolveReview: (
    actionId: string,
    outcome: "approve" | "reject",
  ) => void;
  onSelect: (actionId: string) => void;
  selectedAction: AgentAction;
  statuses: Record<string, RuntimeStatus>;
  waitingAction?: AgentAction;
}) {
  const selectedEvaluation = evaluations[selectedAction.id];

  return (
    <div className="mission-layout">
      <section className="mission-main" aria-label="Mission workflow">
        <div className="metric-band">
          <Metric label="Customer" value={demoMission.customer} />
          <Metric label="Budget cap" value={`$${demoMission.budgetCapUsd}`} />
          <Metric label="Deadline" value="4 days" />
          <Metric
            label="Progress"
            value={`${completedCount}/${demoMission.actions.length} outcomes`}
          />
        </div>

        <div className="section-heading">
          <div>
            <h2>Agent execution plan</h2>
            <p>Routine work runs. Consequential work stops at the owner boundary.</p>
          </div>
          <span className="policy-badge">
            <ShieldCheck aria-hidden="true" size={15} />
            4 policies active
          </span>
        </div>

        <div className="action-list">
          {demoMission.actions.map((action, index) => (
            <ActionRow
              action={action}
              decision={evaluations[action.id].decision}
              index={index}
              isSelected={selectedAction.id === action.id}
              key={action.id}
              onSelect={onSelect}
              status={statuses[action.id]}
            />
          ))}
        </div>
      </section>

      <aside className="inspector" aria-label="Policy inspector">
        <div className="inspector-header">
          <div>
            <p className="eyebrow">POLICY INSPECTOR</p>
            <h2>{selectedAction.agent}</h2>
          </div>
          <DecisionBadge decision={selectedEvaluation.decision} />
        </div>

        <div className="inspector-section">
          <p className="field-label">Proposed action</p>
          <h3>{selectedAction.title}</h3>
          <p>{selectedAction.description}</p>
        </div>

        <dl className="detail-list">
          <div>
            <dt>Authority</dt>
            <dd>{decisionLabel(selectedEvaluation.decision)}</dd>
          </div>
          <div>
            <dt>Destination</dt>
            <dd>{selectedAction.destination ?? "Owner workspace"}</dd>
          </div>
          <div>
            <dt>Spend</dt>
            <dd>{selectedAction.amountUsd ? `$${selectedAction.amountUsd}` : "$0"}</dd>
          </div>
        </dl>

        <div className="rule-result" data-decision={selectedEvaluation.decision}>
          <LockKeyhole aria-hidden="true" size={18} />
          <div>
            <p>{selectedEvaluation.reasons[0]}</p>
            <span>{selectedEvaluation.matchedPolicyIds[0]}</span>
          </div>
        </div>

        {waitingAction?.id === selectedAction.id ? (
          <div className="approval-actions">
            <p>Only you can release this action.</p>
            <div>
              <button
                className="button approve"
                onClick={() => onResolveReview(selectedAction.id, "approve")}
                type="button"
              >
                <Check aria-hidden="true" size={16} />
                Approve
              </button>
              <button
                className="button reject"
                onClick={() => onResolveReview(selectedAction.id, "reject")}
                type="button"
              >
                <X aria-hidden="true" size={16} />
                Reject
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActionRow({
  action,
  decision,
  index,
  isSelected,
  onSelect,
  status,
}: {
  action: AgentAction;
  decision: Decision;
  index: number;
  isSelected: boolean;
  onSelect: (actionId: string) => void;
  status: RuntimeStatus;
}) {
  const Icon = actionIcons[action.kind];

  return (
    <button
      className="action-row"
      data-selected={isSelected}
      onClick={() => onSelect(action.id)}
      type="button"
    >
      <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
      <span className="action-icon"><Icon aria-hidden="true" size={17} /></span>
      <span className="action-copy">
        <strong>{action.title}</strong>
        <span>{action.agent} · {action.description}</span>
      </span>
      <RuntimeBadge decision={decision} status={status} />
      <ChevronRight aria-hidden="true" className="row-chevron" size={17} />
    </button>
  );
}

function RuntimeBadge({
  decision,
  status,
}: {
  decision: Decision;
  status: RuntimeStatus;
}) {
  if (status === "complete") return <span className="runtime-badge complete"><Check size={13} />Complete</span>;
  if (status === "blocked") return <span className="runtime-badge blocked"><X size={13} />Blocked</span>;
  if (status === "running") return <span className="runtime-badge running"><Clock3 size={13} />Running</span>;
  if (status === "awaiting-owner") return <span className="runtime-badge review"><UserRoundCheck size={13} />Review</span>;
  return <span className={`runtime-badge ${decision}`}><Circle size={10} />{decisionLabel(decision)}</span>;
}

function DecisionBadge({ decision }: { decision: Decision }) {
  return <span className="decision-badge" data-decision={decision}>{decisionLabel(decision)}</span>;
}

function PoliciesView({
  policies,
  onToggle,
}: {
  policies: OwnerPolicy[];
  onToggle: (policyId: string) => void;
}) {
  return (
    <section className="content-view narrow-view">
      <div className="view-intro">
        <h2>Your authority, encoded</h2>
        <p>Policies are evaluated before every action. Changes reset the demo so the next run is reproducible.</p>
      </div>
      <div className="policy-list">
        {policies.map((policy) => (
          <div className="policy-row" key={policy.id}>
            <div className="policy-icon"><Settings2 aria-hidden="true" size={18} /></div>
            <div>
              <h3>{policy.name}</h3>
              <p>{policy.description}</p>
              <code>{policy.id}</code>
            </div>
            <button
              aria-checked={policy.enabled}
              aria-label={`${policy.enabled ? "Disable" : "Enable"} ${policy.name}`}
              className="switch"
              data-enabled={policy.enabled}
              onClick={() => onToggle(policy.id)}
              role="switch"
              type="button"
            ><span /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReceiptsView({ receipts }: { receipts: RuntimeReceipt[] }) {
  return (
    <section className="content-view narrow-view">
      <div className="view-intro">
        <h2>Verifiable action history</h2>
        <p>Every completed, approved, rejected, or blocked action produces a deterministic policy receipt.</p>
      </div>
      {receipts.length === 0 ? (
        <div className="empty-state">
          <ReceiptText aria-hidden="true" size={28} />
          <h3>No receipts yet</h3>
          <p>Run the demo mission to generate the first policy outcome.</p>
        </div>
      ) : (
        <div className="receipt-list">
          {receipts.map((receipt) => (
            <article className="receipt-row" key={`${receipt.id}-${receipt.createdAt}`}>
              <div className="receipt-status"><Check aria-hidden="true" size={16} /></div>
              <div>
                <p>{receipt.resultLabel}</p>
                <code>{receipt.id}</code>
              </div>
              <time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
