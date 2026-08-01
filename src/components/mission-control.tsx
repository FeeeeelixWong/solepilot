"use client";

import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
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
  History,
  Inbox,
  ListChecks,
  LockKeyhole,
  KeyRound,
  Play,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Send,
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

type View = "home" | "missions" | "mission" | "decisions" | "policies" | "receipts" | "proof";
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
  { id: "missions", label: "Tasks", icon: ListChecks },
  { id: "decisions", label: "Decisions", icon: Inbox },
  { id: "policies", label: "Rules", icon: ShieldCheck },
  { id: "receipts", label: "Activity", icon: History },
  { id: "proof", label: "System", icon: FileCheck2 },
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
  const [view, setView] = useState<View>("home");
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
  const [composerSeed, setComposerSeed] = useState("");
  const [verification, setVerification] = useState<Verification>(null);
  const [hydrated, setHydrated] = useState(false);
  const [announcement, setAnnouncement] = useState("Mission ready.");
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(null);
  const [ownerCode, setOwnerCode] = useState("");
  const [missionRuntimes, setMissionRuntimes] = useState<PersistedRuntime[]>([]);
  const receiptRef = useRef<RuntimeReceipt[]>([]);
  const artifactRef = useRef<ToolArtifact[]>([]);

  function openComposer(seed = "") {
    setComposerSeed(seed);
    setComposerOpen(true);
  }

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

  function resetRuntime(nextView: View = "mission") {
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
    setView(nextView);
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
    resetRuntime("policies");
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
    setComposerSeed("");
    setView("mission");
    setAnnouncement("A new governed agent plan is ready.");
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand-lockup" onClick={() => setView("home")} type="button">
          <span className="brand-mark" aria-hidden="true">
            <img alt="" height="24" src="/solepilot-mark.svg" width="24" />
          </span>
          <span>
            <strong className="brand-name">SolePilot</strong>
            <small className="brand-caption">AI operations with owner control</small>
          </span>
        </button>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className="nav-button"
                data-active={view === item.id || (item.id === "missions" && view === "mission")}
                data-secondary={item.id === "proof"}
                key={item.id}
                onClick={() => setView(item.id)}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                <span>{item.label}</span>
                {item.id === "receipts" && receipts.length > 0 ? (
                  <span className="nav-count">{receipts.length}</span>
                ) : item.id === "decisions" && waitingAction ? (
                  <span className="nav-count">1</span>
                ) : item.id === "missions" && missionRuntimes.length > 0 ? (
                  <span className="nav-count">{missionRuntimes.length}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="header-actions">
          <span className="runtime-status">
            <span className="status-dot" />
            Protected
          </span>
          <button className="button primary" onClick={() => openComposer()} type="button">
            <Plus aria-hidden="true" size={17} />
            New task
          </button>
        </div>
      </header>

      <main className="workspace">
        {view !== "home" ? (
          <header className="page-header">
            <div className="page-heading">
              {view === "mission" ? (
                <button className="back-link" onClick={() => setView("missions")} type="button">
                  <ArrowLeft aria-hidden="true" size={15} /> Back to tasks
                </button>
              ) : null}
              <p className="eyebrow">
                {view === "mission"
                  ? mission.executionMode === "online" ? "LIVE TASK" : "GUIDED EXAMPLE"
                  : view === "missions"
                    ? "AI WORKSPACE"
                    : view === "decisions"
                      ? "OWNER INBOX"
                  : view === "policies"
                    ? "OWNER RULES"
                    : view === "receipts"
                      ? "ACTIVITY HISTORY"
                      : "HOW SOLEPILOT WORKS"}
              </p>
              <h1>{view === "mission"
                ? mission.title
                : view === "missions"
                  ? "Tasks your AI team is handling"
                  : view === "decisions"
                    ? "Decisions only you can make"
                : view === "policies"
                  ? "Rules your AI team cannot change"
                  : view === "receipts"
                    ? "A record of every finished action"
                    : "Control that sits outside the AI"}</h1>
              {view === "mission" ? (
                <p className="page-summary">
                  {mission.executionMode === "online"
                    ? `For ${mission.customer} · Due ${mission.deadline}`
                    : `For ${mission.customer} · Safe guided preview`}
                </p>
              ) : view === "missions" ? (
                <p className="page-summary">See what is ready, what is moving, and what needs your attention.</p>
              ) : view === "decisions" ? (
                <p className="page-summary">Messages, spending, payments, and commitments pause here before they happen.</p>
              ) : view === "policies" ? (
                <p className="page-summary">Routine work can run automatically. Money, messages, and commitments still need you.</p>
              ) : view === "receipts" ? (
                <p className="page-summary">See what ran, what you approved, and what SolePilot stopped.</p>
              ) : null}
            </div>
            <div className="page-actions">
              {view === "mission" ? (
                <button className="button secondary icon-only" onClick={() => resetRuntime()} title="Reset task" type="button">
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
                  ? "AI team working"
                  : missionIsComplete
                    ? "Task complete"
                    : waitingAction
                      ? "Decision required below"
                      : completedCount > 0
                        ? "Continue task"
                        : "Start task"}
              </button>
              ) : null}
            </div>
          </header>
        ) : null}

        <p className="sr-only" aria-live="polite">{announcement}</p>

        {view === "home" ? (
          <LandingView
            onCreate={openComposer}
            onOpenTasks={() => setView("missions")}
            onRunDemo={loadJudgeDemo}
            runtimeHealth={runtimeHealth}
          />
        ) : null}

        {view === "missions" ? (
          <TasksView
            activeMissionId={mission.id}
            onCreate={() => openComposer()}
            onOpen={openMission}
            runtimes={missionRuntimes}
          />
        ) : null}

        {view === "decisions" ? (
          <DecisionsView onOpen={openMission} onRunDemo={loadJudgeDemo} runtimes={missionRuntimes} />
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
            objective: composerSeed || mission.objective || demoDraft.objective,
            customer: mission.customer || demoDraft.customer,
            source: mission.source || demoDraft.source,
            deadline: mission.deadline || demoDraft.deadline,
            budgetCapUsd: mission.budgetCapUsd || demoDraft.budgetCapUsd,
            missionType: mission.missionType ?? "work",
            payment: mission.payment,
          }}
          initialMode={plannerMode}
          onClose={() => { setComposerOpen(false); setComposerSeed(""); }}
          onCreate={createMission}
        />
      ) : null}
    </div>
  );
}

function summarizeRuntime(runtime: PersistedRuntime) {
  const values = Object.values(runtime.statuses);
  const completed = values.filter((status) => status === "complete" || status === "blocked").length;
  const waiting = values.some((status) => status === "awaiting-owner");
  const complete = runtime.mission.actions.length > 0 && completed === runtime.mission.actions.length;
  const next = runtime.mission.actions.find((action) => runtime.statuses[action.id] === "awaiting-owner")
    ?? runtime.mission.actions.find((action) => runtime.statuses[action.id] === "pending");
  return {
    complete,
    completed,
    next,
    progress: runtime.mission.actions.length === 0 ? 0 : Math.round((completed / runtime.mission.actions.length) * 100),
    state: waiting ? "review" : complete ? "complete" : completed > 0 ? "active" : "ready",
    waiting,
  };
}

function LandingView({ onCreate, onOpenTasks, onRunDemo, runtimeHealth }: {
  onCreate: (seed?: string) => void;
  onOpenTasks: () => void;
  onRunDemo: () => void;
  runtimeHealth: RuntimeHealth | null;
}) {
  const [prompt, setPrompt] = useState("");
  const [preview, setPreview] = useState<"plan" | "approval" | "evidence">("approval");

  function submitPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate(prompt.trim());
  }

  return (
    <section className="landing-view">
      <div className="landing-status-strip">
        <span><i className="status-dot" /> Live product</span>
        <span>Guided example requires no setup</span>
        <button onClick={onOpenTasks} type="button">Open workspace <ArrowRight size={13} /></button>
      </div>

      <section className="landing-hero">
        <div className="landing-brand-signal">
          <span className="landing-mark"><img alt="" height="28" src="/solepilot-mark.svg" width="28" /></span>
          <strong>SOLEPILOT</strong>
        </div>
        <p className="eyebrow">SOLEPILOT CONTROL PLANE</p>
        <h1>AI operations for one-person companies.</h1>
        <p className="landing-subtitle">
          Delegate the work. Keep authority. Your AI team researches, drafts, and prepares actions. SolePilot pauses before
          messages, spending, payments, or commitments leave your company.
        </p>
        <form className="command-entry" onSubmit={submitPrompt}>
          <Bot aria-hidden="true" size={19} />
          <label className="sr-only" htmlFor="landing-task">What should your AI team handle?</label>
          <input
            id="landing-task"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What should your AI team handle?"
            value={prompt}
          />
          <button aria-label="Set up this task" type="submit"><ArrowRight size={18} /></button>
        </form>
        <div className="landing-actions">
          <button className="button primary" onClick={onRunDemo} type="button"><Play size={16} /> Run guided task</button>
          <button className="button secondary" onClick={() => onCreate()} type="button"><Plus size={16} /> Build your own</button>
        </div>
        <div className="landing-trust">
          <span><ShieldCheck size={14} /> AI cannot approve itself</span>
          <span><LockKeyhole size={14} /> Wallet stays with the owner</span>
          <span><ReceiptText size={14} /> Every outcome is recorded</span>
        </div>
      </section>

      <section className="product-preview" aria-label="Interactive SolePilot preview">
        <header className="preview-window-header">
          <div><span className="preview-logo"><img alt="" height="18" src="/solepilot-mark.svg" width="18" /></span><strong>SolePilot</strong><small>GUIDED TASK</small></div>
          <div><span className="preview-live"><i className="status-dot" /> Protected</span><button onClick={onRunDemo} type="button">Open task <ArrowRight size={13} /></button></div>
        </header>
        <div className="preview-tabs" role="tablist" aria-label="Product preview">
          <button aria-selected={preview === "plan"} onClick={() => setPreview("plan")} role="tab" type="button">Task plan</button>
          <button aria-selected={preview === "approval"} onClick={() => setPreview("approval")} role="tab" type="button">Owner decision</button>
          <button aria-selected={preview === "evidence"} onClick={() => setPreview("evidence")} role="tab" type="button">Activity proof</button>
        </div>
        <div className="preview-body">
          <div className="preview-context">
            <p className="section-kicker">QUALIFY A NEW CUSTOMER</p>
            <h2>Research the opportunity and prepare a proposal</h2>
            <span>2 of 5 steps finished</span>
          </div>
          {preview === "plan" ? (
            <div className="preview-plan" role="tabpanel">
              <div data-state="done"><span><Check size={14} /></span><p><strong>Research the opportunity</strong><small>Market and customer evidence collected</small></p><b>Done</b></div>
              <div data-state="done"><span><Check size={14} /></span><p><strong>Draft the delivery scope</strong><small>Proposal prepared for review</small></p><b>Done</b></div>
              <div data-state="review"><span>3</span><p><strong>Send the proposal</strong><small>External message requires the owner</small></p><b>Needs you</b></div>
              <div data-state="blocked"><span>4</span><p><strong>Upgrade the data plan</strong><small>Outside the approved spending limit</small></p><b>Will stop</b></div>
            </div>
          ) : preview === "approval" ? (
            <div className="preview-approval" role="tabpanel">
              <div className="preview-question">
                <span><UserRoundCheck size={21} /></span>
                <div><p className="section-kicker">YOUR DECISION</p><h3>Should the AI team send the proposal?</h3><p>Nothing has been sent or committed yet.</p></div>
              </div>
              <dl><div><dt>Destination</dt><dd>founder@northstar.example</dd></div><div><dt>Reason</dt><dd>External reputation and commercial terms</dd></div></dl>
              <div className="preview-actions"><button onClick={onRunDemo} type="button"><Check size={15} /> Approve action</button><button onClick={onRunDemo} type="button"><X size={15} /> Reject</button></div>
            </div>
          ) : (
            <div className="preview-evidence" role="tabpanel">
              <div><span><CheckCircle2 size={17} /></span><p><strong>Research completed</strong><small>Delegated by your rules · 10:42</small></p><code>ALLOW</code></div>
              <div><span><UserRoundCheck size={17} /></span><p><strong>Proposal approved by owner</strong><small>Single-use approval · 10:44</small></p><code>APPROVED</code></div>
              <div><span><ShieldCheck size={17} /></span><p><strong>Over-limit purchase stopped</strong><small>No connected tool was called · 10:45</small></p><code>BLOCKED</code></div>
              <footer><ReceiptText size={14} /> Hash-linked records verify successfully</footer>
            </div>
          )}
        </div>
      </section>

      <section className="landing-pillars">
        <article><span>01</span><h3>Routine work keeps moving</h3><p>Research and drafting run without turning every step into an approval queue.</p></article>
        <article><span>02</span><h3>Consequences wait for you</h3><p>External messages, money, and commitments pause before a real tool runs.</p></article>
        <article><span>03</span><h3>Claims become evidence</h3><p>Every completed, approved, rejected, or stopped action leaves a checkable record.</p></article>
      </section>

      <footer className="landing-footer">
        <div><strong>SolePilot</strong><span>Owner-controlled AI operations</span></div>
        <nav aria-label="Product resources"><a href="https://github.com/FeeeeelixWong/solepilot" rel="noreferrer" target="_blank">Source <ExternalLink size={11} /></a><a href="https://github.com/FeeeeelixWong/solepilot/blob/main/ARCHITECTURE.md" rel="noreferrer" target="_blank">Architecture <ExternalLink size={11} /></a></nav>
        <span>{runtimeHealth?.online ? "All live services available" : "Guided mode available"}</span>
      </footer>
    </section>
  );
}

function TasksView({ activeMissionId, onCreate, onOpen, runtimes }: {
  activeMissionId: string;
  onCreate: () => void;
  onOpen: (missionId: string) => void;
  runtimes: PersistedRuntime[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | "active" | "complete">("all");
  const summaries = runtimes.map((runtime) => ({ runtime, summary: summarizeRuntime(runtime) }));
  const filtered = summaries.filter(({ runtime, summary }) => {
    const matchesQuery = `${runtime.mission.title} ${runtime.mission.customer}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "attention" && summary.waiting) || (filter === "complete" && summary.complete) || (filter === "active" && summary.state === "active");
    return matchesQuery && matchesFilter;
  });
  const totalSteps = summaries.reduce((total, item) => total + item.runtime.mission.actions.length, 0);
  const finishedSteps = summaries.reduce((total, item) => total + item.summary.completed, 0);
  const waitingCount = summaries.filter((item) => item.summary.waiting).length;

  return (
    <section className="tasks-view">
      <div className="workspace-metrics" aria-label="Task metrics">
        <span><strong>{runtimes.length}</strong> total tasks</span>
        <span><strong>{summaries.filter((item) => !item.summary.complete).length}</strong> open</span>
        <span data-tone={waitingCount ? "attention" : "neutral"}><strong>{waitingCount}</strong> need you</span>
        <span><strong>{finishedSteps}/{totalSteps}</strong> steps resolved</span>
      </div>
      <div className="workspace-toolbar">
        <label><Search size={16} /><span className="sr-only">Search tasks</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks or customers" value={query} /></label>
        <div className="workspace-filters" aria-label="Filter tasks">
          {(["all", "attention", "active", "complete"] as const).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">{value === "attention" ? "Needs you" : value[0].toUpperCase() + value.slice(1)}</button>)}
        </div>
        <button className="button primary" onClick={onCreate} type="button"><Plus size={16} /> New task</button>
      </div>
      <section className="task-library workspace-list">
        <header className="section-title-row"><div><p className="section-kicker">YOUR WORK</p><h2>{filtered.length} task{filtered.length === 1 ? "" : "s"}</h2></div></header>
        <div className="task-list">
          {filtered.map(({ runtime, summary }) => (
            <button className="task-row" data-active={runtime.mission.id === activeMissionId} key={runtime.mission.id} onClick={() => onOpen(runtime.mission.id)} type="button">
              <span className="task-icon">{runtime.mission.missionType === "payment" ? <WalletCards size={18} /> : <BriefcaseBusiness size={18} />}</span>
              <span className="task-copy"><strong>{runtime.mission.title}</strong><small>{runtime.mission.customer}</small><span className="task-next">Next: {summary.next?.title ?? "All actions finished"}</span></span>
              <span className="task-state" data-state={summary.state}>{summary.waiting ? "Needs you" : summary.complete ? "Complete" : summary.completed > 0 ? "In progress" : "Ready"}</span>
              <span className="task-progress"><span><i style={{ width: `${summary.progress}%` }} /></span><strong>{summary.completed} of {runtime.mission.actions.length}</strong></span>
              <ChevronRight aria-hidden="true" size={18} />
            </button>
          ))}
          {filtered.length === 0 ? <div className="workspace-empty"><Search size={21} /><strong>No tasks match this view</strong><p>Clear the search or choose another filter.</p></div> : null}
        </div>
      </section>
    </section>
  );
}

function DecisionsView({ onOpen, onRunDemo, runtimes }: {
  onOpen: (missionId: string) => void;
  onRunDemo: () => void;
  runtimes: PersistedRuntime[];
}) {
  const waiting = runtimes.flatMap((runtime) => runtime.mission.actions
    .filter((action) => runtime.statuses[action.id] === "awaiting-owner")
    .map((action) => ({ action, runtime })));

  return (
    <section className="decisions-view">
      <section className="decision-list-panel">
        <header><div><p className="section-kicker">WAITING FOR YOU</p><h2>{waiting.length ? `${waiting.length} pending decision${waiting.length === 1 ? "" : "s"}` : "Your inbox is clear"}</h2></div><span>{waiting.length}</span></header>
        {waiting.map(({ action, runtime }) => (
          <button className="decision-list-row" key={action.id} onClick={() => onOpen(runtime.mission.id)} type="button">
            <span><UserRoundCheck size={19} /></span><div><strong>{action.title}</strong><small>{runtime.mission.title}</small><p>{action.destination ? `Destination: ${action.destination}` : "An external consequence requires your approval."}</p></div><b>Review <ArrowRight size={14} /></b>
          </button>
        ))}
        {waiting.length === 0 ? (
          <div className="decision-page-empty"><span><CheckCircle2 size={24} /></span><h3>Nothing is waiting on you</h3><p>Your AI team can continue routine work. SolePilot will bring you here before anything consequential happens.</p><button className="button secondary" onClick={onRunDemo} type="button"><Play size={15} /> See an approval example</button></div>
        ) : null}
      </section>
      <aside className="decision-boundary">
        <p className="section-kicker">WHAT PAUSES HERE</p><h2>Authority stays outside the AI</h2>
        <ol><li><span><Send size={16} /></span><div><strong>External messages</strong><p>Nothing reaches a customer or community silently.</p></div></li><li><span><WalletCards size={16} /></span><div><strong>Money and payments</strong><p>Recipient, amount, and purpose remain visible.</p></div></li><li><span><BriefcaseBusiness size={16} /></span><div><strong>Business commitments</strong><p>Commercial terms still require the owner.</p></div></li></ol>
        <footer><KeyRound size={15} /> Each approval is short-lived and bound to one exact action.</footer>
      </aside>
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
    ? "Waiting for your decision"
    : selectedStatus === "complete"
      ? "Finished"
      : selectedStatus === "blocked"
        ? "Stopped by your rules"
        : selectedStatus === "running"
          ? "Working now"
          : selectedEvaluation.decision === "allow"
            ? "Can run automatically"
            : selectedEvaluation.decision === "review"
              ? "Will ask you first"
              : "Your rules will stop this";

  const waitingAmount = waitingAction?.kind === "payment"
    ? `${waitingAction.amount ?? 0} ${waitingAction.asset ?? "SOL"}`
    : waitingAction?.amountUsd
      ? `$${waitingAction.amountUsd}`
      : null;

  return (
    <div className="task-detail">
      {waitingAction ? (
        <section className="decision-banner" aria-labelledby="decision-title">
          <div className="decision-banner-icon"><UserRoundCheck aria-hidden="true" size={22} /></div>
          <div className="decision-banner-copy">
            <p className="section-kicker">YOUR DECISION</p>
            <h2 id="decision-title">Should the AI team {waitingAction.title.toLowerCase()}?</h2>
            <p>SolePilot paused before this action. Nothing has been sent, purchased, or committed yet.</p>
            <dl>
              <div><dt>Destination</dt><dd>{waitingAction.destination ?? "External service"}</dd></div>
              {waitingAmount ? <div><dt>Amount</dt><dd>{waitingAmount}</dd></div> : null}
              <div><dt>Reason</dt><dd>{evaluations[waitingAction.id].reasons[0]}</dd></div>
            </dl>
            {mission.executionMode === "online" && waitingAction.toolName === "outbox.send" ? (
              <label className="owner-code-field">
                <span><KeyRound size={13} /> Confirmation code</span>
                <input
                  autoComplete="one-time-code"
                  onChange={(event) => onOwnerCodeChange(event.target.value)}
                  placeholder={runtimeHealth?.telegram ? "Enter your one-time owner code" : "Live delivery is not configured"}
                  type="password"
                  value={ownerCode}
                />
                <small>This code authorizes only this delivery and is never stored.</small>
              </label>
            ) : null}
          </div>
          <div className="decision-banner-actions">
            <button
              className="button approve"
              disabled={mission.executionMode === "online" && waitingAction.toolName === "outbox.send" && (!runtimeHealth?.telegram || !ownerCode)}
              onClick={() => onResolveReview(waitingAction.id, "approve")}
              type="button"
            >
              <Check aria-hidden="true" size={16} />
              {waitingAction.kind === "payment" ? "Approve payment" : "Approve action"}
            </button>
            <button className="button reject" onClick={() => onResolveReview(waitingAction.id, "reject")} type="button">
              <X aria-hidden="true" size={16} /> Reject
            </button>
          </div>
        </section>
      ) : null}

      <section className="task-summary" aria-label="Task summary">
        <div>
          <p className="section-kicker">GOAL</p>
          <h2>{mission.objective}</h2>
        </div>
        <div className="task-summary-progress">
          <div>
            <span>Progress</span>
            <strong>{missionProgress}%</strong>
          </div>
          <div className="progress-track" aria-label={`${missionProgress}% complete`}>
            <span style={{ width: `${missionProgress}%` }} />
          </div>
        </div>
        <dl>
          <div><dt>Spending limit</dt><dd>{mission.payment ? `${mission.payment.maxAmount} ${mission.payment.asset}` : `$${mission.budgetCapUsd}`}</dd></div>
          <div><dt>Run mode</dt><dd>{mission.executionMode === "online" ? "Live tools" : "Guided example"}</dd></div>
          <div><dt>Owner rules</dt><dd>{activePolicies} active</dd></div>
        </dl>
      </section>

      <div className="task-workspace">
        <section className="workflow-panel" aria-label="AI work plan">
          <header className="section-title-row">
            <div>
              <p className="section-kicker">WORK PLAN</p>
              <h2>What your AI team will do</h2>
            </div>
            <span className="steps-finished">{completedCount} of {mission.actions.length} finished</span>
          </header>
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

        <aside className="action-panel" aria-label="Selected step">
          <header>
            <div>
              <p className="section-kicker">SELECTED STEP</p>
              <h2>{selectedAction.title}</h2>
            </div>
            <RuntimeBadge decision={selectedEvaluation.decision} status={selectedStatus} />
          </header>

          <p className="action-description">{selectedAction.description}</p>

          <div className="permission-callout" data-decision={selectedEvaluation.decision}>
            <LockKeyhole aria-hidden="true" size={18} />
            <div><strong>{stateTitle}</strong><p>{selectedEvaluation.reasons[0]}</p></div>
          </div>

          {(selectedAction.destination || selectedAction.amountUsd || selectedAction.kind === "payment") ? (
            <dl className="action-facts">
              {selectedAction.destination ? <div><dt>Destination</dt><dd>{selectedAction.destination}</dd></div> : null}
              {selectedAction.kind === "payment" ? (
                <div><dt>Amount</dt><dd>{selectedAction.amount ?? 0} {selectedAction.asset ?? "SOL"}</dd></div>
              ) : selectedAction.amountUsd ? <div><dt>Amount</dt><dd>${selectedAction.amountUsd}</dd></div> : null}
            </dl>
          ) : null}

          {selectedArtifact ? (
            <details className="result-card" open>
              <summary><CheckCircle2 size={15} /> Result ready</summary>
              <p>{selectedArtifact.summary}</p>
              <pre>{selectedArtifact.content}</pre>
              {selectedArtifact.externalReference ? (
                <div className="artifact-proof">
                  <span><Cloud size={13} /> Evidence</span>
                  {selectedArtifact.externalReference.startsWith("http") ? (
                    <a href={selectedArtifact.externalReference} rel="noreferrer" target="_blank">
                      Open source <ExternalLink size={12} />
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
            </details>
          ) : (
            <div className="result-empty">
              <Bot size={18} />
              <span>
                {selectedStatus === "awaiting-owner"
                  ? "This step is paused until you approve or reject it above."
                  : selectedStatus === "blocked"
                    ? "This step was stopped before a connected tool could run."
                    : selectedStatus === "running"
                      ? "Your AI team is working on this step now."
                      : <>Select <b>Start task</b> to begin this work.</>}
              </span>
            </div>
          )}

          <details className="technical-details">
            <summary>Technical details</summary>
            <dl className="detail-list">
              <div><dt>Agent</dt><dd>{selectedAction.agent}</dd></div>
              <div><dt>Tool</dt><dd><code>{selectedAction.toolName}</code></dd></div>
              <div><dt>Policy result</dt><dd>{decisionLabel(selectedEvaluation.decision)}</dd></div>
              {selectedAction.network ? <div><dt>Network</dt><dd>{selectedAction.network}</dd></div> : null}
              <div><dt>Rule</dt><dd><code>{selectedEvaluation.matchedPolicyIds[0] ?? "default"}</code></dd></div>
            </dl>
          </details>
        </aside>
      </div>
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
      <span className="step-index">{status === "complete" ? <Check size={14} /> : status === "blocked" ? <X size={14} /> : index + 1}</span>
      <span className="action-icon"><Icon aria-hidden="true" size={18} /></span>
      <span className="action-copy">
        <strong>{action.title}</strong>
        <span>{action.description}</span>
      </span>
      <RuntimeBadge decision={decision} status={status} />
      <ChevronRight aria-hidden="true" className="row-chevron" size={17} />
    </button>
  );
}

function RuntimeBadge({ decision, status }: { decision: Decision; status: RuntimeStatus }) {
  if (status === "complete") return <span className="runtime-badge complete"><Check size={13} />Done</span>;
  if (status === "blocked") return <span className="runtime-badge blocked"><X size={13} />Stopped</span>;
  if (status === "running") return <span className="runtime-badge running"><Clock3 size={13} />Working</span>;
  if (status === "awaiting-owner") return <span className="runtime-badge review"><UserRoundCheck size={13} />Needs you</span>;
  if (decision === "allow") return <span className="runtime-badge allow"><Circle size={9} />Automatic</span>;
  if (decision === "review") return <span className="runtime-badge review"><Circle size={9} />Asks first</span>;
  return <span className="runtime-badge block"><Circle size={9} />Will stop</span>;
}

function RuntimeTrace({ events }: { events: RuntimeEvent[] }) {
  const visible = events.slice(-5).reverse();
  return (
    <details className="runtime-trace">
      <summary className="trace-heading">
        <span><Activity size={14} /> View technical activity</span>
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
    <section className="settings-view">
      <div className="rules-explainer">
        <div><Bot size={19} /><span><strong>AI can propose</strong><small>Research, drafts, messages, and payments</small></span></div>
        <ArrowRight size={17} />
        <div><ShieldCheck size={19} /><span><strong>Your rules decide</strong><small>Run automatically, ask you, or stop</small></span></div>
        <ArrowRight size={17} />
        <div><UserRoundCheck size={19} /><span><strong>You keep control</strong><small>The AI cannot change these rules</small></span></div>
      </div>
      <div className="policy-list">
        {policies.map((policy, index) => (
          <div className="policy-row" key={policy.id}>
            <div className="policy-number">{index + 1}</div>
            <div><h3>{policy.name}</h3><p>{policy.description}</p></div>
            <span className="policy-state">{policy.enabled ? "Active" : "Off"}</span>
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
    <section className="activity-view receipt-view">
      <div className="activity-toolbar ledger-intro">
        <div>
          <h2>{mission.title}</h2>
          <p>{receipts.length ? `${receipts.length} recorded outcome${receipts.length === 1 ? "" : "s"} for this task.` : "Run this task to create its first activity record."}</p>
        </div>
        <div className="ledger-actions">
          <button className="button secondary" disabled={receipts.length === 0} onClick={verify} type="button">
            <ShieldCheck size={16} />Check records
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
          <p>Finished, approved, rejected, and stopped actions will appear here.</p>
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
                  <span className="receipt-link">Step {receipt.actionId}</span>
                </div>
                <div className="receipt-meta">
                  <span>{receipt.artifactDigest ? "RESULT RECORDED" : "NO EXTERNAL RESULT"}</span>
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
  const fallbackDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [draft, setDraft] = useState({
    ...initialDraft,
    deadline: Date.parse(`${initialDraft.deadline}T23:59:59`) > Date.now()
      ? initialDraft.deadline
      : fallbackDeadline,
  });
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState(1);
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPlanning) {
        abortController.current.abort();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlanning, onClose]);

  function continueToNextStep() {
    setError("");
    if (step === 2 && draft.missionType === "work" && (!draft.objective.trim() || !draft.customer.trim())) {
      setError("Describe the task and who it is for before continuing.");
      return;
    }
    if (
      step === 2 &&
      draft.missionType === "payment" &&
      (!payment.payeeName.trim() || !payment.payTo.trim() || !payment.purpose.trim() || payment.amount <= 0)
    ) {
      setError("Add the payee, recipient, amount, and purpose before continuing.");
      return;
    }
    setStep((current) => Math.min(3, current + 1));
  }

  async function submit() {
    setError("");
    if (step < 3) return;
    if (!draft.deadline || Date.parse(`${draft.deadline}T23:59:59`) < Date.now()) {
      setError("Choose a deadline that has not passed.");
      return;
    }
    if (draft.missionType === "work" && draft.budgetCapUsd <= 0) {
      setError("Maximum spend must be greater than zero.");
      return;
    }
    if (draft.missionType === "payment" && payment.maxAmount <= 0) {
      setError("Maximum authorized amount must be greater than zero.");
      return;
    }
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
            <p className="eyebrow">NEW TASK · STEP {step} OF 3</p>
            <h2 id="composer-title">
              {step === 1 ? "What kind of work is this?" : step === 2 ? "What should your AI team do?" : "Where should it stop and ask?"}
            </h2>
          </div>
          <button aria-label="Close task setup" className="button secondary icon-only" onClick={close} title="Close" type="button"><X size={17} /></button>
        </header>

        <div className="composer-progress" aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((value) => <span aria-current={step === value ? "step" : undefined} data-complete={step > value} key={value} />)}
        </div>

        <div className="composer-form">
          {step === 1 ? (
            <fieldset className="task-type-choice">
              <legend>Choose the closest match</legend>
              <button data-active={draft.missionType === "work"} onClick={() => selectMissionType("work")} type="button">
                <span className="choice-icon"><BriefcaseBusiness size={22} /></span>
                <span><strong>Delegate business work</strong><small>Research, plan, draft, and deliver something for you.</small></span>
                <CheckCircle2 size={18} />
              </button>
              <button data-active={draft.missionType === "payment"} onClick={() => selectMissionType("payment")} type="button">
                <span className="choice-icon"><WalletCards size={22} /></span>
                <span><strong>Prepare a payment</strong><small>Check an instruction, ask for approval, then hand it to your wallet.</small></span>
                <CheckCircle2 size={18} />
              </button>
              <div className="choice-note"><ShieldCheck size={16} /> Both paths apply your owner rules before an external action can run.</div>
            </fieldset>
          ) : null}

          {step === 2 && draft.missionType === "work" ? (
            <div className="composer-step">
              <label className="form-field objective-field">
                <span>Describe the outcome you want</span>
                <textarea
                  autoFocus
                  maxLength={500}
                  onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))}
                  placeholder="Example: Research three payment providers, recommend one, and draft an outreach email."
                  value={draft.objective}
                />
              </label>
              <div className="example-prompts" aria-label="Example tasks">
                <span>Try an example</span>
                <button onClick={() => setDraft((current) => ({ ...current, objective: "Research three agent payment providers, compare their pricing and risks, and prepare a recommendation.", customer: "My company" }))} type="button">Compare vendors</button>
                <button onClick={() => setDraft((current) => ({ ...current, objective: "Research a qualified prospect, draft a scoped proposal, and prepare it for my approval before sending.", customer: "Prospective customer" }))} type="button">Prepare a proposal</button>
                <button onClick={() => setDraft((current) => ({ ...current, objective: "Research this week's market developments and draft a concise update for my community.", customer: "Community" }))} type="button">Draft an update</button>
              </div>
              <label className="form-field">
                <span>Who is this work for?</span>
                <input autoComplete="organization" onChange={(event) => setDraft((current) => ({ ...current, customer: event.target.value }))} placeholder="Customer, partner, or your own company" value={draft.customer} />
              </label>
            </div>
          ) : null}

          {step === 2 && draft.missionType === "payment" ? (
            <div className="composer-step">
              <div className="payment-notice">
                <ShieldCheck size={17} />
                <div><strong>Your wallet stays in control</strong><span>SolePilot checks the instruction and pauses for approval. Your wallet signs the exact transfer.</span></div>
              </div>
              <div className="form-grid payment-grid">
                <label className="form-field">
                  <span>Who are you paying?</span>
                  <input autoComplete="organization" onChange={(event) => updatePayment({ payeeName: event.target.value })} placeholder="Vendor or service name" value={payment.payeeName} />
                </label>
                <label className="form-field">
                  <span>Amount ({payment.asset})</span>
                  <input min="0.000001" onChange={(event) => updatePayment({ amount: Number(event.target.value) })} step="0.000001" type="number" value={payment.amount} />
                </label>
                <label className="form-field payment-address-field">
                  <span>Recipient address</span>
                  <input autoCapitalize="off" autoCorrect="off" onChange={(event) => updatePayment({ payTo: event.target.value.trim() })} placeholder="Solana recipient address" spellCheck={false} value={payment.payTo} />
                </label>
              </div>
              <label className="form-field objective-field">
                <span>What is this payment for?</span>
                <textarea maxLength={500} onChange={(event) => updatePayment({ purpose: event.target.value })} value={payment.purpose} />
              </label>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="composer-step">
              <div className="boundary-heading">
                <LockKeyhole size={19} />
                <div><strong>Set the boundaries</strong><p>SolePilot will stop or ask you before the AI crosses them.</p></div>
              </div>
              <div className="form-grid">
                {draft.missionType === "work" ? (
                  <label className="form-field">
                    <span>Maximum spend (USD)</span>
                    <input min="1" onChange={(event) => setDraft((current) => ({ ...current, budgetCapUsd: Number(event.target.value) }))} type="number" value={draft.budgetCapUsd} />
                  </label>
                ) : (
                  <label className="form-field">
                    <span>Maximum authorized ({payment.asset})</span>
                    <input min="0.000001" onChange={(event) => updatePayment({ maxAmount: Number(event.target.value) })} step="0.000001" type="number" value={payment.maxAmount} />
                  </label>
                )}
                <label className="form-field">
                  <span>Finish by</span>
                  <input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} type="date" value={draft.deadline} />
                </label>
              </div>
              {draft.missionType === "payment" ? (
                <label className="form-field objective-field">
                  <span>Conditions the payment must match</span>
                  <textarea maxLength={500} onChange={(event) => updatePayment({ requirements: event.target.value })} value={payment.requirements} />
                </label>
              ) : (
                <label className="form-field">
                  <span>Starting information</span>
                  <input onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} placeholder="Brief, website, or notes" value={draft.source} />
                </label>
              )}

              <fieldset className="run-mode-choice">
                <legend>How should this run?</legend>
                <button data-active={mode === "replay"} disabled={draft.missionType === "payment"} onClick={() => setMode("replay")} type="button">
                  <FileJson size={17} /><span><strong>Preview safely</strong><small>Use sample tools. No setup required.</small></span>
                </button>
                <button data-active={mode === "live-ai"} onClick={() => setMode("live-ai")} type="button">
                  <BrainCircuit size={17} /><span><strong>Use live tools</strong><small>{draft.missionType === "payment" ? "Prepare a wallet-signed transfer" : "Research online and create real outputs"}</small></span>
                </button>
              </fieldset>
            </div>
          ) : null}

          {error ? <div className="composer-error"><AlertTriangle size={16} />{error}</div> : null}

          <footer className="composer-footer">
            <button className="button secondary" onClick={step === 1 ? close : () => { setError(""); setStep((current) => Math.max(1, current - 1)); }} type="button">
              {step === 1 ? "Cancel" : "Back"}
            </button>
            {step < 3 ? (
              <button className="button primary create-plan" onClick={continueToNextStep} type="button">
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button className="button primary create-plan" disabled={isPlanning} onClick={submit} type="button">
                {isPlanning ? <Clock3 size={16} /> : mode === "live-ai" ? <Sparkles size={16} /> : <Play size={16} />}
                {isPlanning ? "Building your plan" : draft.missionType === "payment" ? "Review payment plan" : "Create task"}
              </button>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}
