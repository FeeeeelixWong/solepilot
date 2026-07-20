import type {
  ActionKind,
  AgentAction,
  ExecutionMode,
  Mission,
  MissionDraft,
  PlannerMode,
  ToolName,
} from "./types";

export const LIVE_MODEL = "openai/gpt-5.4-nano";

export type ChatCompletion = (prompt: string) => Promise<string>;

const sandboxToolByKind: Record<ActionKind, ToolName> = {
  research: "workspace.search",
  draft: "document.compose",
  "external-send": "outbox.send",
  "commercial-commitment": "commitment.create",
  spend: "wallet.reserve",
};

const validKinds = new Set<ActionKind>(Object.keys(sandboxToolByKind) as ActionKind[]);

function toolForKind(kind: ActionKind, executionMode: ExecutionMode): ToolName {
  if (kind === "research" && executionMode === "online") return "web.search";
  return sandboxToolByKind[kind];
}

function cleanText(value: unknown, fallback: string, maxLength = 240): string {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function missionId(): string {
  return `mission-${Date.now().toString(36)}`;
}

function titleFromObjective(objective: string): string {
  const cleaned = objective.replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
  const title = cleaned.length > 78
    ? `${cleaned.slice(0, 75).trimEnd()}...`
    : cleaned;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function actionId(index: number, kind: ActionKind): string {
  return `action-${String(index + 1).padStart(2, "0")}-${kind}`;
}

function makeAction(
  index: number,
  kind: ActionKind,
  executionMode: ExecutionMode,
  values: Omit<AgentAction, "id" | "kind" | "toolName">,
): AgentAction {
  return {
    id: actionId(index, kind),
    kind,
    toolName: toolForKind(kind, executionMode),
    ...values,
  };
}

export function createReplayPlan(draft: MissionDraft): Mission {
  const title = titleFromObjective(draft.objective);
  const safeBudget = Math.max(1, Number(draft.budgetCapUsd) || 100);

  return {
    id: missionId(),
    title,
    ...draft,
    budgetCapUsd: safeBudget,
    status: "ready",
    planSource: "replay",
    executionMode: "sandbox",
    plannerModel: "SolePilot reference planner v1",
    actions: [
      makeAction(0, "research", "sandbox", {
        agent: "Scout",
        title: `Research ${draft.customer}`,
        description: `Inspect the workspace brief and extract evidence relevant to: ${draft.objective}`,
      }),
      makeAction(1, "draft", "sandbox", {
        agent: "Planner",
        title: "Draft an execution brief",
        description:
          "Turn the research artifact into a scoped plan with acceptance criteria and exclusions.",
      }),
      makeAction(2, "external-send", "sandbox", {
        agent: "Closer",
        title: "Deliver the proposed plan",
        description:
          "Place the proposal in the governed outbox for delivery to the external stakeholder.",
        destination: `decision-maker@${draft.customer.toLowerCase().replace(/[^a-z0-9]+/g, "") || "customer"}.example`,
      }),
      makeAction(3, "spend", "sandbox", {
        agent: "Operator",
        title: "Reserve delivery tools",
        description: "Reserve a small sandbox budget for the tools needed to execute the plan.",
        amountUsd: Math.max(1, Math.round(safeBudget * 0.4)),
        destination: "Tooling sandbox",
      }),
      makeAction(4, "spend", "sandbox", {
        agent: "Operator",
        title: "Request an unplanned expansion",
        description: "Attempt to reserve an enterprise package beyond delegated authority.",
        amountUsd: Math.round(safeBudget * 1.8),
        destination: "Enterprise vendor sandbox",
      }),
    ],
  };
}

function extractJson(raw: string): unknown {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("The model did not return a JSON execution plan.");
  }
  return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
}

interface RawPlan {
  title?: unknown;
  actions?: unknown;
}

function normalizePlan(raw: unknown, draft: MissionDraft): Mission {
  if (!raw || typeof raw !== "object") throw new Error("The model plan is not an object.");
  const plan = raw as RawPlan;
  if (!Array.isArray(plan.actions)) throw new Error("The model plan has no actions.");

  const actions = plan.actions.slice(0, 6).map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error(`Action ${index + 1} is invalid.`);
    }
    const value = candidate as Record<string, unknown>;
    const kind = value.kind;
    if (typeof kind !== "string" || !validKinds.has(kind as ActionKind)) {
      throw new Error(`Action ${index + 1} has an unsupported kind.`);
    }
    const typedKind = kind as ActionKind;
    const amount = Number(value.amountUsd);

    return makeAction(index, typedKind, "online", {
      agent: cleanText(value.agent, `Agent ${index + 1}`, 40),
      title: cleanText(value.title, `Execute step ${index + 1}`, 80),
      description: cleanText(value.description, "Execute the proposed mission step."),
      destination: typedKind === "external-send"
        ? "Owner Telegram delivery channel"
        : typeof value.destination === "string"
          ? cleanText(value.destination, "Owner workspace", 100)
          : undefined,
      amountUsd: typedKind === "spend" && Number.isFinite(amount)
        ? Math.max(0, Math.round(amount * 100) / 100)
        : undefined,
      containsSensitiveData: value.containsSensitiveData === true,
    });
  });

  if (actions.length < 3) throw new Error("The model plan must contain at least three actions.");
  if (!actions.some((action) => action.kind === "research")) {
    throw new Error("The model plan must contain a research action.");
  }
  if (!actions.some((action) => action.kind === "draft")) {
    throw new Error("The model plan must contain a drafting action.");
  }
  if (!actions.some((action) => ["external-send", "commercial-commitment", "spend"].includes(action.kind))) {
    throw new Error("The model plan must contain a consequential action.");
  }

  return {
    id: missionId(),
    title: cleanText(plan.title, titleFromObjective(draft.objective), 100),
    ...draft,
    budgetCapUsd: Math.max(1, Number(draft.budgetCapUsd) || 100),
    status: "ready",
    planSource: "live-ai",
    executionMode: "online",
    plannerModel: LIVE_MODEL,
    actions,
  };
}

export function buildPlannerPrompt(draft: MissionDraft): string {
  return `You are the planning agent inside SolePilot, a governed runtime for one-person companies.
Create a concise execution plan for this mission.

Objective: ${draft.objective}
Stakeholder: ${draft.customer}
Source: ${draft.source}
Deadline: ${draft.deadline}
Owner budget cap: $${draft.budgetCapUsd}

Return JSON only with this shape:
{"title":"...","actions":[{"agent":"Scout|Planner|Closer|Operator","title":"...","description":"...","kind":"research|draft|external-send|commercial-commitment|spend","destination":"optional","amountUsd":0,"containsSensitiveData":false}]}

Requirements:
- 4 to 6 actions in execution order.
- Include research and drafting.
- Include at least one consequential external action that should require owner approval.
- Include one external-send action that delivers the final artifact after owner approval.
- Include one optional spend above the cap, so fail-closed policy enforcement is observable without moving funds.
- Do not claim that an external action has already happened.`;
}

function responseText(response: unknown): string {
  if (typeof response === "string") return response;
  if (!response || typeof response !== "object") return String(response ?? "");

  const message = (response as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part === "object" && part && "text" in part
            ? String((part as { text: unknown }).text)
            : "",
      )
      .join("");
  }
  return String(response);
}

export const puterChat: ChatCompletion = async (prompt) => {
  if (typeof window === "undefined") {
    throw new Error("Live AI is available only in the browser.");
  }

  if (!window.puter?.ai?.chat) await loadPuter();
  if (!window.puter?.ai?.chat) throw new Error("Live AI could not be loaded.");

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Live AI timed out. Reopen the planner and try again.")),
        60_000,
      );
    });
    const response = await Promise.race([
      window.puter.ai.chat(prompt, { model: LIVE_MODEL }),
      timeout,
    ]);
    return responseText(response);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

let puterLoad: Promise<void> | null = null;

function loadPuter(): Promise<void> {
  if (window.puter?.ai?.chat) return Promise.resolve();
  if (puterLoad) return puterLoad;

  puterLoad = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-solepilot-puter="true"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Puter.js failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://js.puter.com/v2/";
    script.async = true;
    script.dataset.solepilotPuter = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Puter.js failed to load.")), { once: true });
    document.head.append(script);
  });

  return puterLoad;
}

export async function planMission(
  draft: MissionDraft,
  mode: PlannerMode,
  complete: ChatCompletion = puterChat,
): Promise<Mission> {
  if (mode === "replay") return createReplayPlan(draft);
  const raw = await complete(buildPlannerPrompt(draft));
  return normalizePlan(extractJson(raw), draft);
}
