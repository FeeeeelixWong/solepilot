"use client";

import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Cloud,
  Clock3,
  Download,
  ExternalLink,
  FileCheck2,
  FileJson,
  LockKeyhole,
  KeyRound,
  Play,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  UserRoundCheck,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { demoDraft, demoMission } from "@/lib/demo";
import { planMission } from "@/lib/planner";
import { evaluateAction, ownerPolicies } from "@/lib/policy";
import { createReceipt, verifyReceiptChain } from "@/lib/receipt";
import { loadRuntime, saveRuntime } from "@/lib/storage";
import { executeGovernedAction } from "@/lib/tools";
import { getRuntimeHealth, type RuntimeHealth } from "@/lib/online";
import type {
  ActionOutcome,
  AgentAction,
  Decision,
  Mission,
  MissionDraft,
  OwnerPolicy,
  PlannerMode,
  RuntimeEvent,
  RuntimeReceipt,
  RuntimeStatus,
  ToolArtifact,
} from "@/lib/types";

type View = "mission" | "policies" | "receipts";
type Verification = { valid: boolean; checked: number; error?: string } | null;

const actionIcons: Record<AgentAction["kind"], typeof Search> = {
  research: Search,
  draft: FileCheck2,
  "external-send": Send,
  "commercial-commitment": UserRoundCheck,
  spend: WalletCards,
};

const navItems: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "mission", label: "Mission", icon: Activity },
  { id: "policies", label: "Policies", icon: ShieldCheck },
  { id: "receipts", label: "Ledger", icon: ReceiptText },
];

const delay = (duration: number) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

function statusesFor(mission: Mission): Record<string, RuntimeStatus> {
  return Object.fromEntries(
    mission.actions.map((action) => [action.id, "pending"]),
  ) as Record<string, RuntimeStatus>;
}

function decisionLabel(decision: Decision): string {
  if (decision === "allow") return "Delegated";
  if (decision === "review") return "Owner review";
  return "Blocked";
}

function outcomeLabel(outcome: ActionOutcome): string {
  if (outcome === "delegated") return "DELEGATED ALLOW";
  if (outcome === "approved") return "OWNER APPROVED";
  if (outcome === "rejected") return "OWNER REJECTED";
  return "POLICY BLOCK";
}

function newEvent(
  label: string,
  detail: string,
  tone: RuntimeEvent["tone"] = "neutral",
  actionId?: string,
): RuntimeEvent {
  return {
    id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    actionId,
    tone,
    label,
    detail,
    createdAt: new Date().toISOString(),
  };
}

export function MissionControl() {
  const [view, setView] = useState<View>("mission");
  const [mission, setMission] = useState<Mission>(demoMission);
  const [statuses, setStatuses] = useState<Record<string, RuntimeStatus>>(
    statusesFor(demoMission),
  );
  const [policies, setPolicies] = useState<OwnerPolicy[]>(ownerPolicies);
  const [selectedActionId, setSelectedActionId] = useState(demoMission.actions[0].id);
  const [receipts, setReceipts] = useState<RuntimeReceipt[]>([]);
  const [artifacts, setArtifacts] = useState<ToolArtifact[]>([]);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [plannerMode, setPlannerMode] = useState<PlannerMode>("replay");
  const [isRunning, setIsRunning] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [verification, setVerification] = useState<Verification>(null);
  const [hydrated, setHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("Mission ready.");
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(null);
  const [ownerCode, setOwnerCode] = useState("");
  const receiptRef = useRef<RuntimeReceipt[]>([]);
  const artifactRef = useRef<ToolArtifact[]>([]);

  useEffect(() => {
    const saved = loadRuntime();
    if (saved) {
      setMission(saved.mission);
      setStatuses(saved.statuses);
      setPolicies(saved.policies);
      setReceipts(saved.receipts);
      setArtifacts(saved.artifacts);
      setEvents(saved.events);
      setPlannerMode(saved.plannerMode);
      setSelectedActionId(saved.mission.actions[0]?.id ?? "");
      receiptRef.current = saved.receipts;
      artifactRef.current = saved.artifacts;
      setAnnouncement("Restored the last governed runtime from this browser.");
    } else {
      const event = newEvent(
        "MISSION READY",
        "Reference plan loaded with zero-config replay.",
        "success",
      );
      setEvents([event]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    let active = true;
    getRuntimeHealth()
      .then((health) => {
        if (active) setRuntimeHealth(health);
      })
      .catch(() => {
        if (active) setRuntimeHealth(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveRuntime({
      version: 3,
      mission,
      statuses,
      policies,
      receipts,
      artifacts,
      events,
      plannerMode,
    });
  }, [artifacts, events, hydrated, mission, plannerMode, policies, receipts, statuses]);

  const evaluations = useMemo(
    () =>
      Object.fromEntries(
        mission.actions.map((action) => [
          action.id,
          evaluateAction(action, mission, policies),
        ]),
      ),
    [mission, policies],
  );
  const selectedAction =
    mission.actions.find((action) => action.id === selectedActionId) ??
    mission.actions[0];
  const waitingAction = mission.actions.find(
    (action) => statuses[action.id] === "awaiting-owner",
  );
  const completedCount = Object.values(statuses).filter(
    (status) => status === "complete" || status === "blocked",
  ).length;
  const missionIsComplete =
    mission.actions.length > 0 && completedCount === mission.actions.length;

  function appendEvent(event: RuntimeEvent) {
    setEvents((current) => [...current, event].slice(-24));
  }

  function commitArtifact(artifact: ToolArtifact) {
    const next = [...artifactRef.current, artifact];
    artifactRef.current = next;
    setArtifacts(next);
  }

  async function issueReceipt(
    action: AgentAction,
    outcome: ActionOutcome,
    artifact?: ToolArtifact,
  ) {
    const evaluation = evaluateAction(action, mission, policies);
    const previous = receiptRef.current.at(-1)?.id ?? null;
    const receipt = await createReceipt(
      mission,
      evaluation,
      outcome,
      previous,
      receiptRef.current.length + 1,
      artifact,
    );
    const runtimeReceipt = { ...receipt, resultLabel: outcomeLabel(outcome) };
    const next = [...receiptRef.current, runtimeReceipt];
    receiptRef.current = next;
    setReceipts(next);
    setVerification(null);
    appendEvent(
      newEvent(
        "RECEIPT COMMITTED",
        `${receipt.id} linked at sequence ${receipt.sequence}.`,
        outcome === "blocked" || outcome === "rejected" ? "blocked" : "success",
        action.id,
      ),
    );
  }

  async function runMission() {
    if (isRunning || waitingAction || missionIsComplete) return;

    setIsRunning(true);
    const localStatuses = { ...statuses };

    for (const action of mission.actions) {
      if (localStatuses[action.id] !== "pending") continue;

      const evaluation = evaluateAction(action, mission, policies);
      setSelectedActionId(action.id);
      localStatuses[action.id] = "running";
      setStatuses({ ...localStatuses });
      setAnnouncement(`${action.agent} proposed ${action.title}.`);
      appendEvent(
        newEvent(
          "POLICY EVALUATION",
          `${action.toolName} requested by ${action.agent}: ${evaluation.decision.toUpperCase()}.`,
          evaluation.decision === "review"
            ? "review"
            : evaluation.decision === "block"
              ? "blocked"
              : "neutral",
          action.id,
        ),
      );
      await delay(420);

      if (evaluation.decision === "review") {
        localStatuses[action.id] = "awaiting-owner";
        setStatuses({ ...localStatuses });
        setAnnouncement(`${action.title} is waiting for owner approval.`);
        appendEvent(
          newEvent(
            "TOOL PAUSED",
            `${action.toolName} was not invoked. Owner decision required.`,
            "review",
            action.id,
          ),
        );
        setIsRunning(false);
        return;
      }

      if (evaluation.decision === "block") {
        localStatuses[action.id] = "blocked";
        setStatuses({ ...localStatuses });
        appendEvent(
          newEvent(
            "TOOL BLOCKED",
            `${action.toolName} was prevented before invocation.`,
            "blocked",
            action.id,
          ),
        );
        await issueReceipt(action, "blocked");
        await delay(280);
        continue;
      }

      try {
        appendEvent(
          newEvent(
            "TOOL INVOKED",
            `${action.toolName} entered the governed execution adapter.`,
            "neutral",
            action.id,
          ),
        );
        const { artifact } = await executeGovernedAction({
          action,
          mission,
          mode: mission.planSource,
          policies,
          previousArtifacts: artifactRef.current,
        });
        commitArtifact(artifact);
        localStatuses[action.id] = "complete";
        setStatuses({ ...localStatuses });
        await issueReceipt(action, "delegated", artifact);
        setAnnouncement(`${action.title} completed inside delegated authority.`);
      } catch (error) {
        localStatuses[action.id] = "pending";
        setStatuses({ ...localStatuses });
        const message = error instanceof Error ? error.message : "The tool call failed.";
        appendEvent(newEvent("RUNTIME ERROR", message, "blocked", action.id));
        setAnnouncement(message);
        setIsRunning(false);
        return;
      }
      await delay(280);
    }

    setAnnouncement("Mission complete. Every proposed action has a governed outcome.");
    appendEvent(
      newEvent(
        "MISSION COMPLETE",
        "The runtime reached a terminal outcome for every action.",
        "success",
      ),
    );
    setIsRunning(false);
  }

  async function resolveOwnerReview(
    actionId: string,
    outcome: "approve" | "reject",
  ) {
    const action = mission.actions.find((candidate) => candidate.id === actionId);
    if (!action || statuses[actionId] !== "awaiting-owner" || isRunning) return;

    setIsRunning(true);
    if (outcome === "reject") {
      setStatuses((current) => ({ ...current, [actionId]: "blocked" }));
      appendEvent(
        newEvent(
          "OWNER REJECTED",
          `${action.toolName} remained unexecuted.`,
          "blocked",
          action.id,
        ),
      );
      await issueReceipt(action, "rejected");
      setAnnouncement(`${action.title} was rejected. Continue when ready.`);
      setIsRunning(false);
      return;
    }

    setStatuses((current) => ({ ...current, [actionId]: "running" }));
    appendEvent(
      newEvent(
        "OWNER APPROVED",
        `${action.toolName} was released to the governed adapter.`,
        "success",
        action.id,
      ),
    );
    try {
      const { artifact } = await executeGovernedAction({
        action,
        mission,
        mode: mission.planSource,
        policies,
        previousArtifacts: artifactRef.current,
        authorization: "owner-approved",
        ownerCode,
      });
      commitArtifact(artifact);
      setStatuses((current) => ({ ...current, [actionId]: "complete" }));
      await issueReceipt(action, "approved", artifact);
      setAnnouncement(`${action.title} was approved and executed. Continue when ready.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The approved tool call failed.";
      setStatuses((current) => ({ ...current, [actionId]: "awaiting-owner" }));
      appendEvent(newEvent("RUNTIME ERROR", message, "blocked", action.id));
      setAnnouncement(message);
    }
    setIsRunning(false);
  }

  function resetRuntime() {
    const nextStatuses = statusesFor(mission);
    setStatuses(nextStatuses);
    setReceipts([]);
    setArtifacts([]);
    setEvents([
      newEvent("MISSION RESET", "Execution state cleared; the plan and owner policies remain.", "neutral"),
    ]);
    receiptRef.current = [];
    artifactRef.current = [];
    setSelectedActionId(mission.actions[0]?.id ?? "");
    setVerification(null);
    setOwnerCode("");
    setAnnouncement("Mission reset. The policy runtime is ready.");
    setView("mission");
  }

  function togglePolicy(policyId: string) {
    setPolicies((current) =>
      current.map((policy) =>
        policy.id === policyId ? { ...policy, enabled: !policy.enabled } : policy,
      ),
    );
    resetRuntime();
  }

  async function createMission(
    draft: MissionDraft,
    mode: PlannerMode,
    signal: AbortSignal,
  ) {
    const nextMission = await planMission(draft, mode);
    if (signal.aborted) return;
    const nextStatuses = statusesFor(nextMission);
    const event = newEvent(
      mode === "live-ai" ? "AI PLAN CREATED" : "REPLAY PLAN CREATED",
      `${nextMission.actions.length} tool calls proposed by ${nextMission.plannerModel}.`,
      "success",
    );
    setMission(nextMission);
    setStatuses(nextStatuses);
    setReceipts([]);
    setArtifacts([]);
    setEvents([event]);
    setPlannerMode(mode);
    setSelectedActionId(nextMission.actions[0]?.id ?? "");
    receiptRef.current = [];
    artifactRef.current = [];
    setVerification(null);
    setOwnerCode("");
    setComposerOpen(false);
    setView("mission");
    setAnnouncement("A new governed agent plan is ready.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Bot size={20} /></div>
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

        <div className="runtime-identity">
          <span className="status-dot" />
          <div>
            <p>{mission.executionMode === "online" ? "Online agent runtime" : "Replay runtime"}</p>
            <span>{mission.executionMode === "online" ? `${runtimeHealth?.version ?? "checking"} / server tools` : mission.plannerModel}</span>
          </div>
        </div>
        <div className="owner-card">
          <div className="owner-avatar" aria-hidden="true">MH</div>
          <div>
            <p className="owner-name">Mingfeng</p>
            <p className="owner-role">Owner online</p>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">ONE-PERSON COMPANY / {mission.id.toUpperCase()}</p>
            <h1>{view === "mission" ? mission.title : navItems.find((item) => item.id === view)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <span className="runtime-badge live" data-live={mission.executionMode === "online"}>
              {mission.executionMode === "online" ? <Cloud size={13} /> : <FileJson size={13} />}
              {mission.executionMode === "online"
                ? runtimeHealth?.telegram ? "Online · ready" : "Online · limited"
                : "Replay"}
            </span>
            <button className="button secondary icon-command" onClick={() => setComposerOpen(true)} title="New mission" type="button">
              <Plus aria-hidden="true" size={17} />
              <span>New mission</span>
            </button>
            <button className="button secondary icon-only" onClick={resetRuntime} title="Reset runtime" type="button">
              <RotateCcw aria-hidden="true" size={17} />
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
                {isRunning
                  ? "Runtime active"
                  : missionIsComplete
                    ? "Mission complete"
                    : completedCount > 0
                      ? "Continue mission"
                      : "Run mission"}
              </button>
            ) : null}
          </div>
        </header>

        <p className="sr-only" aria-live="polite">{announcement}</p>

        {view === "mission" && selectedAction ? (
          <MissionView
            artifacts={artifacts}
            completedCount={completedCount}
            evaluations={evaluations}
            events={events}
            mission={mission}
            onOwnerCodeChange={setOwnerCode}
            onResolveReview={resolveOwnerReview}
            onSelect={setSelectedActionId}
            policies={policies}
            selectedAction={selectedAction}
            statuses={statuses}
            ownerCode={ownerCode}
            runtimeHealth={runtimeHealth}
            waitingAction={waitingAction}
          />
        ) : null}

        {view === "policies" ? (
          <PoliciesView policies={policies} onToggle={togglePolicy} />
        ) : null}

        {view === "receipts" ? (
          <ReceiptsView
            mission={mission}
            onVerification={setVerification}
            receipts={receipts}
            verification={verification}
          />
        ) : null}
      </main>

      {composerOpen ? (
        <MissionComposer
          initialDraft={{
            objective: mission.objective || demoDraft.objective,
            customer: mission.customer || demoDraft.customer,
            source: mission.source || demoDraft.source,
            deadline: mission.deadline || demoDraft.deadline,
            budgetCapUsd: mission.budgetCapUsd || demoDraft.budgetCapUsd,
          }}
          initialMode={plannerMode}
          onClose={() => setComposerOpen(false)}
          onCreate={createMission}
        />
      ) : null}
    </div>
  );
}

function MissionView({
  artifacts,
  completedCount,
  evaluations,
  events,
  mission,
  onOwnerCodeChange,
  onResolveReview,
  onSelect,
  policies,
  selectedAction,
  statuses,
  ownerCode,
  runtimeHealth,
  waitingAction,
}: {
  artifacts: ToolArtifact[];
  completedCount: number;
  evaluations: Record<string, ReturnType<typeof evaluateAction>>;
  events: RuntimeEvent[];
  mission: Mission;
  onOwnerCodeChange: (value: string) => void;
  onResolveReview: (actionId: string, outcome: "approve" | "reject") => void;
  onSelect: (actionId: string) => void;
  policies: OwnerPolicy[];
  selectedAction: AgentAction;
  statuses: Record<string, RuntimeStatus>;
  ownerCode: string;
  runtimeHealth: RuntimeHealth | null;
  waitingAction?: AgentAction;
}) {
  const selectedEvaluation = evaluations[selectedAction.id];
  const selectedArtifact = artifacts.find((artifact) => artifact.actionId === selectedAction.id);
  const activePolicies = policies.filter((policy) => policy.enabled).length;

  return (
    <div className="mission-layout">
      <section className="mission-main" aria-label="Mission workflow">
        <div className="metric-band">
          <Metric label="Stakeholder" value={mission.customer} />
          <Metric label="Budget cap" value={`$${mission.budgetCapUsd}`} />
          <Metric label="Runtime" value={mission.executionMode === "online" ? "Online agent" : "Safe replay"} />
          <Metric label="Progress" value={`${completedCount}/${mission.actions.length} outcomes`} />
        </div>

        <div className="section-heading">
          <div>
            <h2>Agent execution plan</h2>
            <p>{mission.objective}</p>
          </div>
          <span className="policy-badge">
            <ShieldCheck aria-hidden="true" size={15} />
            {activePolicies} policies active
          </span>
        </div>

        <div className="action-list">
          {mission.actions.map((action, index) => (
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

        <RuntimeTrace events={events} />
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
          <p className="field-label">Proposed tool call</p>
          <h3>{selectedAction.title}</h3>
          <p>{selectedAction.description}</p>
        </div>

        <dl className="detail-list">
          <div><dt>Tool</dt><dd><code>{selectedAction.toolName}</code></dd></div>
          <div><dt>Authority</dt><dd>{decisionLabel(selectedEvaluation.decision)}</dd></div>
          <div><dt>Destination</dt><dd>{selectedAction.destination ?? "Owner workspace"}</dd></div>
          <div><dt>Spend</dt><dd>{selectedAction.amountUsd ? `$${selectedAction.amountUsd}` : "$0"}</dd></div>
        </dl>

        <div className="rule-result" data-decision={selectedEvaluation.decision}>
          <LockKeyhole aria-hidden="true" size={18} />
          <div>
            <p>{selectedEvaluation.reasons[0]}</p>
            <span>{selectedEvaluation.matchedPolicyIds[0]}</span>
          </div>
        </div>

        {selectedArtifact ? (
          <div className="artifact-result">
            <div className="artifact-heading">
              <span><TerminalSquare size={14} /> Tool artifact</span>
              <code>{selectedArtifact.provider}</code>
            </div>
            <p>{selectedArtifact.summary}</p>
            <pre>{selectedArtifact.content}</pre>
            {selectedArtifact.externalReference ? (
              <div className="artifact-proof">
                <span><Cloud size={13} /> Provider reference</span>
                {selectedArtifact.externalReference.startsWith("http") ? (
                  <a href={selectedArtifact.externalReference} rel="noreferrer" target="_blank">
                    Open evidence <ExternalLink size={12} />
                  </a>
                ) : <code>{selectedArtifact.externalReference}</code>}
              </div>
            ) : null}
            {selectedArtifact.evidence?.length ? (
              <div className="evidence-list">
                {selectedArtifact.evidence.map((item) => (
                  <a href={item.url} key={item.url} rel="noreferrer" target="_blank">
                    <span>{item.source}</span>{item.title}<ExternalLink size={11} />
                  </a>
                ))}
              </div>
            ) : null}
            {selectedArtifact.attestation ? (
              <div className="artifact-attestation">
                <ShieldCheck size={13} />
                <code>{selectedArtifact.attestation.slice(0, 28)}...</code>
              </div>
            ) : null}
          </div>
        ) : null}

        {waitingAction?.id === selectedAction.id ? (
          <div className="approval-actions">
            <p>{selectedAction.toolName} is paused at the owner boundary.</p>
            {mission.executionMode === "online" && selectedAction.toolName === "outbox.send" ? (
              <label className="owner-code-field">
                <span><KeyRound size={13} /> Owner connector code</span>
                <input
                  autoComplete="one-time-code"
                  onChange={(event) => onOwnerCodeChange(event.target.value)}
                  placeholder={runtimeHealth?.telegram ? "Required for live delivery" : "Connector not configured"}
                  type="password"
                  value={ownerCode}
                />
                <small>The code releases one fixed-destination Telegram connector. It is never persisted.</small>
              </label>
            ) : null}
            <div>
              <button
                className="button approve"
                disabled={mission.executionMode === "online" && selectedAction.toolName === "outbox.send" && (!runtimeHealth?.telegram || !ownerCode)}
                onClick={() => onResolveReview(selectedAction.id, "approve")}
                type="button"
              >
                <Check aria-hidden="true" size={16} />Approve
              </button>
              <button className="button reject" onClick={() => onResolveReview(selectedAction.id, "reject")} type="button">
                <X aria-hidden="true" size={16} />Reject
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function ActionRow({ action, decision, index, isSelected, onSelect, status }: {
  action: AgentAction;
  decision: Decision;
  index: number;
  isSelected: boolean;
  onSelect: (actionId: string) => void;
  status: RuntimeStatus;
}) {
  const Icon = actionIcons[action.kind];
  return (
    <button className="action-row" data-selected={isSelected} onClick={() => onSelect(action.id)} type="button">
      <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
      <span className="action-icon"><Icon aria-hidden="true" size={17} /></span>
      <span className="action-copy">
        <strong>{action.title}</strong>
        <span>{action.agent} · <code>{action.toolName}</code> · {action.description}</span>
      </span>
      <RuntimeBadge decision={decision} status={status} />
      <ChevronRight aria-hidden="true" className="row-chevron" size={17} />
    </button>
  );
}

function RuntimeBadge({ decision, status }: { decision: Decision; status: RuntimeStatus }) {
  if (status === "complete") return <span className="runtime-badge complete"><Check size={13} />Complete</span>;
  if (status === "blocked") return <span className="runtime-badge blocked"><X size={13} />Blocked</span>;
  if (status === "running") return <span className="runtime-badge running"><Clock3 size={13} />Running</span>;
  if (status === "awaiting-owner") return <span className="runtime-badge review"><UserRoundCheck size={13} />Review</span>;
  return <span className={`runtime-badge ${decision}`}><Circle size={10} />{decisionLabel(decision)}</span>;
}

function DecisionBadge({ decision }: { decision: Decision }) {
  return <span className="decision-badge" data-decision={decision}>{decisionLabel(decision)}</span>;
}

function RuntimeTrace({ events }: { events: RuntimeEvent[] }) {
  const visible = events.slice(-5).reverse();
  return (
    <div className="runtime-trace">
      <div className="trace-heading">
        <span><Activity size={14} /> Runtime trace</span>
        <code>{events.length} {events.length === 1 ? "event" : "events"}</code>
      </div>
      {visible.length === 0 ? <p className="trace-empty">No runtime events.</p> : (
        <div className="trace-list">
          {visible.map((event) => (
            <div className="trace-row" data-tone={event.tone} key={event.id}>
              <span className="trace-dot" />
              <strong>{event.label}</strong>
              <p>{event.detail}</p>
              <time>{new Date(event.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PoliciesView({ policies, onToggle }: { policies: OwnerPolicy[]; onToggle: (policyId: string) => void }) {
  return (
    <section className="content-view narrow-view">
      <div className="view-intro">
        <h2>Your authority, encoded</h2>
        <p>Every proposed tool call is evaluated against this policy set before execution.</p>
      </div>
      <div className="policy-list">
        {policies.map((policy) => (
          <div className="policy-row" key={policy.id}>
            <div className="policy-icon"><Settings2 aria-hidden="true" size={18} /></div>
            <div><h3>{policy.name}</h3><p>{policy.description}</p><code>{policy.id}</code></div>
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

function ReceiptsView({ mission, onVerification, receipts, verification }: {
  mission: Mission;
  onVerification: (result: Verification) => void;
  receipts: RuntimeReceipt[];
  verification: Verification;
}) {
  async function verify() {
    onVerification(await verifyReceiptChain(receipts));
  }

  function exportLedger() {
    const payload = JSON.stringify({
      schema: "solepilot.receipt-ledger.v1",
      exportedAt: new Date().toISOString(),
      mission: { id: mission.id, objective: mission.objective, planSource: mission.planSource },
      receipts,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${mission.id}-receipt-ledger.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="content-view narrow-view receipt-view">
      <div className="view-intro ledger-intro">
        <div>
          <h2>Hash-linked action ledger</h2>
          <p>Policy outcome, owner decision, artifact digest, and previous receipt are committed together.</p>
        </div>
        <div className="ledger-actions">
          <button className="button secondary" disabled={receipts.length === 0} onClick={verify} type="button">
            <ShieldCheck size={16} />Verify chain
          </button>
          <button className="button secondary icon-only" disabled={receipts.length === 0} onClick={exportLedger} title="Export JSON ledger" type="button">
            <Download size={16} />
          </button>
        </div>
      </div>

      {verification ? (
        <div className="verification-result" data-valid={verification.valid}>
          {verification.valid ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
          <span>{verification.valid ? `${verification.checked} receipts verified. Chain intact.` : verification.error}</span>
        </div>
      ) : null}

      {receipts.length === 0 ? (
        <div className="empty-state">
          <ReceiptText aria-hidden="true" size={28} />
          <h3>No receipts yet</h3>
          <p>Run the mission to commit the first policy outcome.</p>
        </div>
      ) : (
        <div className="receipt-list">
          {receipts.map((receipt) => (
            <article className="receipt-row" key={receipt.id}>
              <div className="receipt-sequence">{String(receipt.sequence).padStart(2, "0")}</div>
              <div>
                <p>{receipt.resultLabel}</p>
                <code>{receipt.id}</code>
                <span className="receipt-link">prev: {receipt.previousReceiptId ?? "GENESIS"}</span>
              </div>
              <div className="receipt-meta">
                <span>{receipt.artifactDigest ? "ARTIFACT SEALED" : "NO TOOL OUTPUT"}</span>
                <time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MissionComposer({ initialDraft, initialMode, onClose, onCreate }: {
  initialDraft: MissionDraft;
  initialMode: PlannerMode;
  onClose: () => void;
  onCreate: (draft: MissionDraft, mode: PlannerMode, signal: AbortSignal) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initialDraft);
  const [mode, setMode] = useState(initialMode);
  const [isPlanning, setIsPlanning] = useState(false);
  const [error, setError] = useState("");
  const abortController = useRef(new AbortController());

  function close() {
    abortController.current.abort();
    onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsPlanning(true);
    try {
      await onCreate(draft, mode, abortController.current.signal);
    } catch (caught) {
      if (abortController.current.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "The planner could not create this mission.");
      setIsPlanning(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="composer-title" aria-modal="true" className="mission-composer" role="dialog">
        <header className="composer-header">
          <div>
            <p className="eyebrow">NEW GOVERNED RUNTIME</p>
            <h2 id="composer-title">Create a mission</h2>
          </div>
          <button className="button secondary icon-only" onClick={close} title="Close" type="button"><X size={17} /></button>
        </header>

        <form onSubmit={submit}>
          <label className="form-field objective-field">
            <span>Objective</span>
            <textarea
              maxLength={500}
              onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))}
              required
              value={draft.objective}
            />
          </label>
          <div className="form-grid">
            <label className="form-field">
              <span>Stakeholder</span>
              <input onChange={(event) => setDraft((current) => ({ ...current, customer: event.target.value }))} required value={draft.customer} />
            </label>
            <label className="form-field">
              <span>Source</span>
              <input onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} required value={draft.source} />
            </label>
            <label className="form-field">
              <span>Deadline</span>
              <input onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} required type="date" value={draft.deadline} />
            </label>
            <label className="form-field">
              <span>Budget cap (USD)</span>
              <input min="1" onChange={(event) => setDraft((current) => ({ ...current, budgetCapUsd: Number(event.target.value) }))} required type="number" value={draft.budgetCapUsd} />
            </label>
          </div>

          <fieldset className="planner-choice">
            <legend>Planner</legend>
            <button data-active={mode === "replay"} onClick={() => setMode("replay")} type="button">
              <FileJson size={17} /><span><strong>Replay</strong><small>Zero-config reference run</small></span>
            </button>
            <button data-active={mode === "live-ai"} onClick={() => setMode("live-ai")} type="button">
              <BrainCircuit size={17} /><span><strong>Online agent</strong><small>Live research, AI work, governed delivery</small></span>
            </button>
          </fieldset>

          {error ? <div className="composer-error"><AlertTriangle size={16} />{error}</div> : null}

          <footer className="composer-footer">
            <button className="button secondary" onClick={close} type="button">Cancel</button>
            <button className="button primary create-plan" disabled={isPlanning} type="submit">
              {isPlanning ? <Clock3 size={16} /> : mode === "live-ai" ? <Sparkles size={16} /> : <Play size={16} />}
              {isPlanning ? "Planning" : mode === "live-ai" ? "Launch online agent" : "Create replay plan"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
