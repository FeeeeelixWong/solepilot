"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
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
  LayoutDashboard,
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

import { ProofView } from "@/components/proof-view";
import { demoDraft, demoMission } from "@/lib/demo";
import { planMission } from "@/lib/planner";
import { evaluateAction, ownerPolicies } from "@/lib/policy";
import { createReceipt, verifyReceiptChain } from "@/lib/receipt";
import { loadWorkspace, saveWorkspace } from "@/lib/storage";
import { issueApprovalCapability } from "@/lib/capability";
import { executeGovernedAction } from "@/lib/tools";
import { getRuntimeHealth, type RuntimeHealth } from "@/lib/online";
import type {
  ActionOutcome,
  AgentAction,
  ApprovalCapability,
  Decision,
  Mission,
  MissionDraft,
  OwnerPolicy,
  PlannerMode,
  RuntimeEvent,
  RuntimeReceipt,
  RuntimeStatus,
  ToolArtifact,
  PaymentIntent,
  PersistedRuntime,
} from "@/lib/types";

type View = "missions" | "mission" | "policies" | "receipts" | "proof";
type Verification = { valid: boolean; checked: number; error?: string } | null;

const actionIcons: Record<AgentAction["kind"], typeof Search> = {
  research: Search,
  draft: FileCheck2,
  "external-send": Send,
  "commercial-commitment": UserRoundCheck,
  spend: WalletCards,
  payment: WalletCards,
};

const navItems: Array<{ id: View; label: string; icon: typeof Activity }> = [
  { id: "missions", label: "Overview", icon: LayoutDashboard },
  { id: "mission", label: "Mission", icon: Activity },
  { id: "policies", label: "Guardrails", icon: ShieldCheck },
  { id: "receipts", label: "Audit", icon: ReceiptText },
  { id: "proof", label: "Proof", icon: FileCheck2 },
];

const delay = (duration: number) =>
  new Promise((resolve) => window.setTimeout(resolve, duration));

const defaultPaymentIntent: PaymentIntent = {
  payeeName: "",
  scheme: "native-transfer",
  network: "solana-devnet",
  asset: "SOL",
  amount: 0.01,
  maxAmount: 0.05,
  payTo: "",
  purpose: "Pay an approved vendor invoice",
  requirements: "Recipient and amount must match this instruction; owner wallet signature required.",
};

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
  const [view, setView] = useState<View>("missions");
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
  const [missionRuntimes, setMissionRuntimes] = useState<PersistedRuntime[]>([]);
  const receiptRef = useRef<RuntimeReceipt[]>([]);
  const artifactRef = useRef<ToolArtifact[]>([]);

  function restoreRuntime(runtime: PersistedRuntime) {
    const savedPolicies = new Map(
      runtime.policies.map((policy) => [policy.id, policy]),
    );
    setMission(runtime.mission);
    setStatuses(runtime.statuses);
    setPolicies(ownerPolicies.map((policy) => ({
      ...policy,
      enabled: savedPolicies.get(policy.id)?.enabled ?? policy.enabled,
    })));
    setReceipts(runtime.receipts);
    setArtifacts(runtime.artifacts);
    setEvents(runtime.events);
    setPlannerMode(runtime.plannerMode);
    setSelectedActionId(runtime.mission.actions[0]?.id ?? "");
    setVerification(null);
    setOwnerCode("");
    receiptRef.current = runtime.receipts;
    artifactRef.current = runtime.artifacts;
  }

  useEffect(() => {
    const workspace = loadWorkspace();
    if (workspace) {
      const active = workspace.runtimes.find(
        (runtime) => runtime.mission.id === workspace.activeMissionId,
      ) ?? workspace.runtimes[0];
      setMissionRuntimes(workspace.runtimes);
      restoreRuntime(active);
      setAnnouncement("Restored the last governed runtime from this browser.");
    } else {
      const event = newEvent(
        "MISSION READY",
        "Reference plan loaded with zero-config replay.",
        "success",
      );
      setEvents([event]);
      setMissionRuntimes([{
        version: 4,
        mission: demoMission,
        statuses: statusesFor(demoMission),
        policies: ownerPolicies,
        receipts: [],
        artifacts: [],
        events: [event],
        plannerMode: "replay",
      }]);
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
    const activeRuntime: PersistedRuntime = {
      version: 4,
      mission,
      statuses,
      policies,
      receipts,
      artifacts,
      events,
      plannerMode,
    };
    setMissionRuntimes((current) => {
      const index = current.findIndex(
        (runtime) => runtime.mission.id === mission.id,
      );
      const next = index >= 0
        ? current.map((runtime, runtimeIndex) =>
            runtimeIndex === index ? activeRuntime : runtime)
        : [activeRuntime, ...current];
      saveWorkspace({
        version: 1,
        activeMissionId: mission.id,
        runtimes: next,
      });
      return next;
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
    capability?: ApprovalCapability,
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
      capability,
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

  async function runMission(
    initialStatuses: Record<string, RuntimeStatus> = statuses,
    resumeAfterApproval = false,
  ) {
    const hasWaitingAction = mission.actions.some(
      (action) => initialStatuses[action.id] === "awaiting-owner",
    );
    const initialCompletedCount = Object.values(initialStatuses).filter(
      (status) => status === "complete" || status === "blocked",
    ).length;
    const initialMissionIsComplete =
      mission.actions.length > 0 && initialCompletedCount === mission.actions.length;

    if ((!resumeAfterApproval && isRunning) || hasWaitingAction) return;
    if (initialMissionIsComplete) {
      setAnnouncement("Mission complete. Every proposed action has a governed outcome.");
      appendEvent(
        newEvent(
          "MISSION COMPLETE",
          "The runtime reached a terminal outcome for every action.",
          "success",
        ),
      );
      setIsRunning(false);
      return;
    }

    setIsRunning(true);
    const localStatuses = { ...initialStatuses };

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
      const evaluation = evaluateAction(action, mission, policies);
      const approvalCapability = await issueApprovalCapability(
        action,
        mission,
        evaluation,
      );
      appendEvent(
        newEvent(
          "CAPABILITY ISSUED",
          `${approvalCapability.id} is bound to this action and expires in five minutes.`,
          "success",
          action.id,
        ),
      );
      const { artifact } = await executeGovernedAction({
        action,
        mission,
        mode: mission.planSource,
        policies,
        previousArtifacts: artifactRef.current,
        approvalCapability,
        ownerCode,
      });
      commitArtifact(artifact);
      const nextStatuses: Record<string, RuntimeStatus> = {
        ...statuses,
        [actionId]: "complete",
      };
      setStatuses(nextStatuses);
      await issueReceipt(action, "approved", artifact, approvalCapability);
      setAnnouncement(`${action.title} was approved and executed. Continuing automatically.`);
      await delay(180);
      await runMission(nextStatuses, true);
      return;
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

  function loadJudgeDemo() {
    const event = newEvent(
      "PROOF READY",
      "Zero-configuration policy walkthrough loaded for evaluation.",
      "success",
    );
    const nextStatuses = statusesFor(demoMission);
    setMission(demoMission);
    setStatuses(nextStatuses);
    setPolicies(ownerPolicies);
    setReceipts([]);
    setArtifacts([]);
    setEvents([event]);
    setPlannerMode("replay");
    setSelectedActionId(demoMission.actions[0].id);
    setVerification(null);
    setOwnerCode("");
    receiptRef.current = [];
    artifactRef.current = [];
    setAnnouncement("The 90-second governed execution proof is ready.");
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

  function openMission(missionId: string) {
    if (isRunning || missionId === mission.id) {
      setView("mission");
      return;
    }
    const runtime = missionRuntimes.find(
      (candidate) => candidate.mission.id === missionId,
    );
    if (!runtime) return;
    restoreRuntime(runtime);
    setView("mission");
    setAnnouncement(`Opened ${runtime.mission.title}.`);
  }

  async function createMission(
    draft: MissionDraft,
    mode: PlannerMode,
    signal: AbortSignal,
  ) {
    const nextMission = await planMission(draft, mode, undefined, signal);
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
          <div className="brand-mark" aria-hidden="true">
            <img alt="" height="24" src="/solepilot-mark.svg" width="24" />
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
                data-secondary={item.id === "proof"}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                <span>{item.label}</span>
                {item.id === "receipts" && receipts.length > 0 ? (
                  <span className="nav-count">{receipts.length}</span>
                ) : item.id === "missions" && missionRuntimes.length > 0 ? (
                  <span className="nav-count">{missionRuntimes.length}</span>
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
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {view === "missions"
                ? "SOLEPILOT / COMPANY CONTROL"
                : view === "proof"
                  ? "SOLEPILOT / SYSTEM PROOF"
                  : `SOLEPILOT / ${mission.id.toUpperCase()}`}
            </p>
            <h1>{view === "mission"
              ? mission.title
              : view === "missions"
                ? "Company overview"
                : view === "proof"
                  ? "System proof"
                  : navItems.find((item) => item.id === view)?.label}</h1>
            {view === "missions" ? (
              <p className="page-summary">Delegate work to AI agents. SolePilot pauses spending, external messages, and commitments for your approval.</p>
            ) : view === "mission" ? (
              <p className="page-summary">
                {mission.customer} · {mission.executionMode === "online" ? "Online agent" : "Safe replay"}
              </p>
            ) : null}
          </div>
          <div className="topbar-actions">
            {view === "missions" || view === "mission" ? (
              <button className={`button ${view === "missions" ? "primary" : "secondary"} icon-command`} onClick={() => setComposerOpen(true)} title="New mission" type="button">
                <Plus aria-hidden="true" size={17} />
                <span>New mission</span>
              </button>
            ) : null}
            {view !== "missions" && view !== "proof" ? (
              <button className="button secondary icon-only" onClick={resetRuntime} title="Reset runtime" type="button">
                <RotateCcw aria-hidden="true" size={17} />
              </button>
            ) : null}
            {view === "mission" ? (
              <button
                aria-busy={isRunning}
                className="button primary"
                disabled={isRunning || Boolean(waitingAction) || missionIsComplete}
                onClick={() => runMission()}
                type="button"
              >
                {isRunning ? <Clock3 aria-hidden="true" size={16} /> : <Play aria-hidden="true" size={16} />}
                {isRunning
                  ? "Runtime active"
                  : missionIsComplete
                    ? "Mission complete"
                    : waitingAction
                      ? "Approval required"
                      : completedCount > 0
                        ? "Continue mission"
                        : "Run mission"}
              </button>
            ) : null}
          </div>
        </header>

        <p className="sr-only" aria-live="polite">{announcement}</p>

        {view === "missions" ? (
          <OverviewView
            activeMissionId={mission.id}
            onOpen={openMission}
            onRunDemo={loadJudgeDemo}
            policies={policies}
            runtimes={missionRuntimes}
          />
        ) : null}

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

        {view === "proof" ? (
          <ProofView
            onStartDemo={loadJudgeDemo}
            receiptCount={receipts.length}
            runtimeHealth={runtimeHealth}
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
            missionType: mission.missionType ?? "work",
            payment: mission.payment,
          }}
          initialMode={plannerMode}
          onClose={() => setComposerOpen(false)}
          onCreate={createMission}
        />
      ) : null}
    </div>
  );
}

function OverviewView({
  activeMissionId,
  onOpen,
  onRunDemo,
  policies,
  runtimes,
}: {
  activeMissionId: string;
  onOpen: (missionId: string) => void;
  onRunDemo: () => void;
  policies: OwnerPolicy[];
  runtimes: PersistedRuntime[];
}) {
  const totals = runtimes.reduce(
    (current, runtime) => {
      const values = Object.values(runtime.statuses);
      current.actions += runtime.mission.actions.length;
      current.completed += values.filter(
        (status) => status === "complete" || status === "blocked",
      ).length;
      current.reviews += values.filter(
        (status) => status === "awaiting-owner",
      ).length;
      current.receipts += runtime.receipts.length;
      return current;
    },
    { actions: 0, completed: 0, reviews: 0, receipts: 0 },
  );

  const approvalRuntime = runtimes.find((runtime) =>
    Object.values(runtime.statuses).includes("awaiting-owner"),
  );
  const approvalAction = approvalRuntime?.mission.actions.find(
    (action) => approvalRuntime.statuses[action.id] === "awaiting-owner",
  );
  const activePolicyCount = policies.filter((policy) => policy.enabled).length;

  return (
    <section className="overview-lite">
      <div className="overview-meta-bar" aria-label="Workspace status">
        <span><i className="status-dot" />Runtime ready</span>
        <span><strong>{activePolicyCount}</strong> guardrails</span>
        <span><strong>{totals.reviews}</strong> approvals</span>
        <span><strong>{totals.receipts}</strong> verified outcomes</span>
        <button onClick={onRunDemo} type="button"><Play size={14} />Load sample mission</button>
      </div>

      <section className="overview-section approval-queue">
        <header className="overview-section-header">
          <div>
            <h2>Approval queue</h2>
            <p>External actions stay paused until you decide.</p>
          </div>
          <span>{totals.reviews}</span>
        </header>
        {approvalAction && approvalRuntime ? (
          <button className="approval-queue-row" onClick={() => onOpen(approvalRuntime.mission.id)} type="button">
            <span className="queue-icon"><UserRoundCheck size={18} /></span>
            <span className="queue-copy">
              <strong>{approvalAction.title}</strong>
              <span>{approvalRuntime.mission.title}</span>
            </span>
            <span className="queue-context">
              <small>Destination</small>
              <strong>{approvalAction.destination ?? "External service"}</strong>
            </span>
            <span className="queue-review">Review <ArrowRight size={14} /></span>
          </button>
        ) : (
          <div className="approval-empty">
            <CheckCircle2 size={18} />
            <span><strong>No approvals waiting</strong> Agents can continue within their existing guardrails.</span>
          </div>
        )}
      </section>

      <section className="overview-section mission-table-section">
        <header className="overview-section-header">
          <div>
            <h2>Missions</h2>
            <p>Every plan keeps its actions, decisions, and evidence together.</p>
          </div>
          <span>{runtimes.length}</span>
        </header>
        <div className="mission-table-labels" aria-hidden="true">
          <span>Mission</span><span>Status</span><span>Progress</span><span>Next action</span><span />
        </div>
        <div className="mission-table">
          {runtimes.map((runtime) => {
            const values = Object.values(runtime.statuses);
            const completed = values.filter(
              (status) => status === "complete" || status === "blocked",
            ).length;
            const waiting = values.some((status) => status === "awaiting-owner");
            const complete = runtime.mission.actions.length > 0 && completed === runtime.mission.actions.length;
            const next = runtime.mission.actions.find(
              (action) => runtime.statuses[action.id] === "awaiting-owner",
            ) ?? runtime.mission.actions.find(
              (action) => runtime.statuses[action.id] === "pending",
            );
            const progress = runtime.mission.actions.length === 0
              ? 0
              : Math.round((completed / runtime.mission.actions.length) * 100);
            const state = waiting ? "review" : complete ? "complete" : "ready";
            return (
              <button
                className="mission-table-row"
                data-active={runtime.mission.id === activeMissionId}
                key={runtime.mission.id}
                onClick={() => onOpen(runtime.mission.id)}
                type="button"
              >
                <span className="mission-table-name">
                  <i>{runtime.mission.missionType === "payment" ? <WalletCards size={16} /> : <FileCheck2 size={16} />}</i>
                  <span><strong>{runtime.mission.title}</strong><small>{runtime.mission.customer}</small></span>
                </span>
                <span className="table-status" data-state={state}><i />{waiting ? "Needs approval" : complete ? "Complete" : "Ready"}</span>
                <span className="table-progress"><span><i style={{ width: `${progress}%` }} /></span><strong>{completed}/{runtime.mission.actions.length}</strong></span>
                <span className="table-next">{next?.title ?? "No actions remaining"}</span>
                <ChevronRight size={17} />
              </button>
            );
          })}
        </div>
      </section>
    </section>
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
  const selectedStatus = statuses[selectedAction.id];
  const missionProgress = mission.actions.length === 0
    ? 0
    : Math.round((completedCount / mission.actions.length) * 100);
  const stateTitle = selectedStatus === "awaiting-owner"
    ? "Needs your approval"
    : selectedStatus === "complete"
      ? "Completed safely"
      : selectedStatus === "blocked"
        ? "Blocked by a guardrail"
        : selectedStatus === "running"
          ? "Running now"
          : selectedEvaluation.decision === "allow"
            ? "Ready to run"
            : selectedEvaluation.decision === "review"
              ? "Will pause for approval"
              : "Will be blocked";

  return (
    <div className="mission-layout">
      <section className="mission-main" aria-label="Mission workflow">
        <div className="mission-summary">
          <div className="mission-summary-heading">
            <div>
              <p className="mission-summary-label">Objective</p>
              <h2>{mission.objective}</h2>
            </div>
            <span className="guardrail-status">
              <ShieldCheck aria-hidden="true" size={15} />
              {activePolicies} guardrails active
            </span>
          </div>
          <div className="mission-summary-footer">
            <div className="mission-progress-row">
              <div className="progress-track" aria-label={`${missionProgress}% complete`}>
                <span style={{ width: `${missionProgress}%` }} />
              </div>
              <strong>{completedCount}/{mission.actions.length}</strong>
            </div>
            <div className="mission-meta-line">
              <span>{mission.payment ? `${mission.payment.maxAmount} ${mission.payment.asset} limit` : `$${mission.budgetCapUsd} budget limit`}</span>
              <span>{mission.executionMode === "online" ? "Online agent" : "Safe replay"}</span>
            </div>
          </div>
        </div>

        <div className="section-heading compact-heading">
          <div>
            <h2>Execution plan</h2>
            <p>Every action is checked before its tool can run.</p>
          </div>
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

      <aside className="inspector" aria-label="Action details">
        <div className="inspector-header">
          <div>
            <p className="eyebrow">ACTION DETAILS</p>
            <h2>{selectedAction.title}</h2>
          </div>
          <RuntimeBadge decision={selectedEvaluation.decision} status={selectedStatus} />
        </div>

        <div className="inspector-section">
          <p className="action-agent">{selectedAction.agent}</p>
          <p>{selectedAction.description}</p>
        </div>

        <dl className="detail-list essential-details">
          <div><dt>Destination</dt><dd>{selectedAction.destination ?? "Owner workspace"}</dd></div>
          <div>
            <dt>{selectedAction.kind === "payment" ? "Payment" : "Spend"}</dt>
            <dd>{selectedAction.kind === "payment"
              ? `${selectedAction.amount ?? 0} ${selectedAction.asset ?? "SOL"}`
              : selectedAction.amountUsd ? `$${selectedAction.amountUsd}` : "$0"}</dd>
          </div>
        </dl>

        <div className="rule-result" data-decision={selectedEvaluation.decision}>
          <LockKeyhole aria-hidden="true" size={18} />
          <div>
            <strong>{stateTitle}</strong>
            <p>{selectedEvaluation.reasons[0]}</p>
          </div>
        </div>

        {waitingAction?.id === selectedAction.id ? (
          <div className="approval-actions">
            <p>Review the destination and amount above, then decide whether this action may continue.</p>
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
                <small>The code releases this one approved delivery and is never stored.</small>
              </label>
            ) : null}
            <div>
              <button
                className="button approve"
                disabled={mission.executionMode === "online" && selectedAction.toolName === "outbox.send" && (!runtimeHealth?.telegram || !ownerCode)}
                onClick={() => onResolveReview(selectedAction.id, "approve")}
                type="button"
              >
                <Check aria-hidden="true" size={16} />
                {selectedAction.kind === "payment" ? "Approve & pay" : "Approve & continue"}
              </button>
              <button className="button reject" onClick={() => onResolveReview(selectedAction.id, "reject")} type="button">
                <X aria-hidden="true" size={16} />Reject
              </button>
            </div>
          </div>
        ) : null}

        <details className="technical-details">
          <summary>Technical details</summary>
          <dl className="detail-list">
            <div><dt>Tool</dt><dd><code>{selectedAction.toolName}</code></dd></div>
            {selectedAction.scheme ? <div><dt>Scheme</dt><dd>{selectedAction.scheme}</dd></div> : null}
            <div><dt>Authority</dt><dd>{decisionLabel(selectedEvaluation.decision)}</dd></div>
            {selectedAction.network ? <div><dt>Network</dt><dd>{selectedAction.network}</dd></div> : null}
            {selectedAction.resource ? <div><dt>Resource</dt><dd>{selectedAction.resource}</dd></div> : null}
            {selectedAction.requirements ? <div><dt>Requirements</dt><dd>{selectedAction.requirements}</dd></div> : null}
            <div><dt>Guardrail</dt><dd><code>{selectedEvaluation.matchedPolicyIds[0] ?? "default"}</code></dd></div>
          </dl>
          <div className="capability-note">
            <KeyRound size={14} />
            Approval creates a one-time capability bound to this mission and action for five minutes.
          </div>
        </details>

        {selectedArtifact ? (
          <details className="artifact-result">
            <summary className="artifact-heading">
              <span><TerminalSquare size={14} /> View result</span>
              <code>{selectedArtifact.provider}</code>
            </summary>
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
          </details>
        ) : null}
      </aside>
    </div>
  );
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
        <span>{action.agent} · <code>{action.toolName}</code></span>
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

function RuntimeTrace({ events }: { events: RuntimeEvent[] }) {
  const visible = events.slice(-5).reverse();
  return (
    <details className="runtime-trace">
      <summary className="trace-heading">
        <span><Activity size={14} /> Activity log</span>
        <code>{events.length} {events.length === 1 ? "event" : "events"}</code>
      </summary>
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
    </details>
  );
}

function PoliciesView({ policies, onToggle }: { policies: OwnerPolicy[]; onToggle: (policyId: string) => void }) {
  return (
    <section className="content-view narrow-view">
      <div className="view-intro">
        <h2>Decide what agents can do</h2>
        <p>These guardrails run before any external action. Switch one off to test a different authority boundary.</p>
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
  const [copiedReceiptId, setCopiedReceiptId] = useState("");

  async function verify() {
    onVerification(await verifyReceiptChain(receipts));
  }

  async function copyReceipt(receipt: RuntimeReceipt) {
    await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
    setCopiedReceiptId(receipt.id);
    window.setTimeout(() => setCopiedReceiptId(""), 1600);
  }

  function exportLedger() {
    const payload = JSON.stringify({
      schema: "solepilot.receipt-ledger.v2",
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
          <h2>Every outcome, verifiable</h2>
          <p>Review or export the evidence created as your agents work.</p>
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
            <details className="receipt-proof" key={receipt.id}>
              <summary className="receipt-row">
                <div className="receipt-sequence">{String(receipt.sequence).padStart(2, "0")}</div>
                <div>
                  <p>{receipt.resultLabel}</p>
                  <code>{receipt.id}</code>
                  <span className="receipt-link">prev: {receipt.previousReceiptId ?? "GENESIS"}</span>
                </div>
                <div className="receipt-meta">
                  <span>{receipt.artifactDigest ? "ARTIFACT SEALED" : "NO TOOL OUTPUT"}</span>
                  {receipt.approvalCapabilityId ? (
                    <code>{receipt.approvalCapabilityId}</code>
                  ) : null}
                  <time dateTime={receipt.createdAt}>{new Date(receipt.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                </div>
                <ChevronRight aria-hidden="true" className="receipt-chevron" size={17} />
              </summary>
              <div className="receipt-proof-body">
                <dl className="receipt-proof-grid">
                  <div><dt>Action</dt><dd><code>{receipt.actionId}</code></dd></div>
                  <div><dt>Policy decision</dt><dd>{receipt.policyDecision.toUpperCase()}</dd></div>
                  <div><dt>Outcome</dt><dd>{receipt.outcome.toUpperCase()}</dd></div>
                  <div><dt>Capability</dt><dd><code>{receipt.approvalCapabilityId ?? "NOT REQUIRED"}</code></dd></div>
                  <div><dt>Artifact digest</dt><dd><code>{receipt.artifactDigest ?? "NO TOOL OUTPUT"}</code></dd></div>
                  <div><dt>Previous receipt</dt><dd><code>{receipt.previousReceiptId ?? "GENESIS"}</code></dd></div>
                </dl>
                <div className="canonical-proof">
                  <div>
                    <span>Canonical payload committed by SHA-256</span>
                    <button
                      className="copy-proof"
                      onClick={() => copyReceipt(receipt)}
                      type="button"
                    >
                      {copiedReceiptId === receipt.id ? <Check size={13} /> : <FileJson size={13} />}
                      {copiedReceiptId === receipt.id ? "Copied" : "Copy receipt JSON"}
                    </button>
                  </div>
                  <pre>{receipt.canonicalPayload}</pre>
                </div>
              </div>
            </details>
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
  const payment = draft.payment ?? defaultPaymentIntent;

  function selectMissionType(missionType: MissionDraft["missionType"]) {
    setDraft((current) => ({
      ...current,
      missionType,
      payment: missionType === "payment"
        ? current.payment ?? defaultPaymentIntent
        : current.payment,
    }));
    if (missionType === "payment") setMode("live-ai");
  }

  function updatePayment(values: Partial<PaymentIntent>) {
    setDraft((current) => ({
      ...current,
      missionType: "payment",
      payment: { ...(current.payment ?? defaultPaymentIntent), ...values },
    }));
  }

  function close() {
    abortController.current.abort();
    onClose();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (draft.missionType === "payment" && payment.amount > payment.maxAmount) {
      setError("Payment amount cannot exceed the maximum authorized amount.");
      return;
    }
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
          <fieldset className="planner-choice mission-type-choice">
            <legend>Mission type</legend>
            <button data-active={draft.missionType === "work"} onClick={() => selectMissionType("work")} type="button">
              <FileCheck2 size={17} /><span><strong>Work mission</strong><small>Research, create, and deliver</small></span>
            </button>
            <button data-active={draft.missionType === "payment"} onClick={() => selectMissionType("payment")} type="button">
              <WalletCards size={17} /><span><strong>Payment mission</strong><small>Check, approve, and pay</small></span>
            </button>
          </fieldset>

          {draft.missionType === "payment" ? (
            <>
              <div className="payment-notice">
                <ShieldCheck size={17} />
                <div><strong>Owner-signed payment</strong><span>SolePilot checks the intent; your wallet signs the exact transfer.</span></div>
              </div>
              <div className="form-grid payment-grid">
                <label className="form-field">
                  <span>Payee name</span>
                  <input onChange={(event) => updatePayment({ payeeName: event.target.value })} placeholder="Acme API Services" required value={payment.payeeName} />
                </label>
                <label className="form-field">
                  <span>Payment route</span>
                  <input readOnly value={`${payment.scheme} · ${payment.network}`} />
                </label>
                <label className="form-field payment-address-field">
                  <span>Recipient address</span>
                  <input autoCapitalize="off" autoCorrect="off" onChange={(event) => updatePayment({ payTo: event.target.value.trim() })} placeholder="Solana recipient address" required spellCheck={false} value={payment.payTo} />
                </label>
                <label className="form-field">
                  <span>Amount ({payment.asset})</span>
                  <input max={payment.maxAmount} min="0.000001" onChange={(event) => updatePayment({ amount: Number(event.target.value) })} required step="0.000001" type="number" value={payment.amount} />
                </label>
                <label className="form-field">
                  <span>Maximum authorized ({payment.asset})</span>
                  <input min="0.000001" onChange={(event) => updatePayment({ maxAmount: Number(event.target.value) })} required step="0.000001" type="number" value={payment.maxAmount} />
                </label>
                <label className="form-field">
                  <span>Payment deadline</span>
                  <input onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} required type="date" value={draft.deadline} />
                </label>
              </div>
              <label className="form-field objective-field">
                <span>Payment purpose</span>
                <textarea maxLength={500} onChange={(event) => updatePayment({ purpose: event.target.value })} required value={payment.purpose} />
              </label>
              <details className="advanced-settings">
                <summary>More settings</summary>
                <label className="form-field objective-field">
                  <span>Execution requirements</span>
                  <textarea maxLength={500} onChange={(event) => updatePayment({ requirements: event.target.value })} required value={payment.requirements} />
                </label>
              </details>
            </>
          ) : (
            <>
              <label className="form-field objective-field">
                <span>Objective</span>
                <textarea maxLength={500} onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} required value={draft.objective} />
              </label>
              <div className="form-grid">
                <label className="form-field">
                  <span>Stakeholder</span>
                  <input onChange={(event) => setDraft((current) => ({ ...current, customer: event.target.value }))} required value={draft.customer} />
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
              <details className="advanced-settings">
                <summary>More settings</summary>
                <label className="form-field">
                  <span>Source</span>
                  <input onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} required value={draft.source} />
                </label>
              </details>
            </>
          )}

          <fieldset className="planner-choice">
            <legend>Planner</legend>
            <button data-active={mode === "replay"} disabled={draft.missionType === "payment"} onClick={() => setMode("replay")} type="button">
              <FileJson size={17} /><span><strong>Guided demo</strong><small>No setup required</small></span>
            </button>
            <button data-active={mode === "live-ai"} onClick={() => setMode("live-ai")} type="button">
              <BrainCircuit size={17} /><span><strong>Live agent</strong><small>{draft.missionType === "payment" ? "Wallet-signed transfer" : "Plan and execute online"}</small></span>
            </button>
          </fieldset>

          {error ? <div className="composer-error"><AlertTriangle size={16} />{error}</div> : null}

          <footer className="composer-footer">
            <button className="button secondary" onClick={close} type="button">Cancel</button>
            <button className="button primary create-plan" disabled={isPlanning} type="submit">
              {isPlanning ? <Clock3 size={16} /> : mode === "live-ai" ? <Sparkles size={16} /> : <Play size={16} />}
              {isPlanning
                ? "Planning on server"
                : draft.missionType === "payment"
                  ? "Create payment mission"
                  : mode === "live-ai"
                    ? "Launch online agent"
                    : "Create replay plan"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
