import type {
  PaymentIntent,
  PersistedRuntime,
  PersistedWorkspace,
} from "./types";

export const WORKSPACE_STORAGE_KEY = "solepilot.workspace.v1";
const LEGACY_RUNTIME_STORAGE_KEY = "solepilot.runtime.v3";

function migratePayment(value: unknown): PaymentIntent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const payment = value as Record<string, unknown>;

  if (
    typeof payment.payeeName === "string" &&
    (payment.scheme === "native-transfer" || payment.scheme === "x402") &&
    typeof payment.network === "string" &&
    typeof payment.asset === "string" &&
    typeof payment.amount === "number" &&
    typeof payment.maxAmount === "number" &&
    typeof payment.payTo === "string" &&
    typeof payment.purpose === "string" &&
    typeof payment.requirements === "string"
  ) {
    return payment as unknown as PaymentIntent;
  }

  if (
    typeof payment.payeeName === "string" &&
    typeof payment.recipientAddress === "string" &&
    typeof payment.amountSol === "number" &&
    typeof payment.maxAmountSol === "number" &&
    typeof payment.purpose === "string" &&
    typeof payment.requirements === "string"
  ) {
    return {
      payeeName: payment.payeeName,
      scheme: "native-transfer",
      network: "solana-devnet",
      asset: "SOL",
      amount: payment.amountSol,
      maxAmount: payment.maxAmountSol,
      payTo: payment.recipientAddress,
      purpose: payment.purpose,
      requirements: payment.requirements,
    };
  }

  return undefined;
}

function migrateRuntime(value: unknown): PersistedRuntime | null {
  if (!value || typeof value !== "object") return null;
  const runtime = value as Record<string, unknown>;
  const mission = runtime.mission as Record<string, unknown> | undefined;
  if (
    !mission?.id ||
    !Array.isArray(mission.actions) ||
    !Array.isArray(runtime.receipts) ||
    !Array.isArray(runtime.artifacts) ||
    !Array.isArray(runtime.policies) ||
    !Array.isArray(runtime.events)
  ) {
    return null;
  }

  const payment = migratePayment(mission.payment);
  const migratedMission = {
    ...mission,
    payment,
    actions: mission.actions.map((candidate) => {
      const action = candidate as Record<string, unknown>;
      if (action.kind !== "payment") return action;
      return {
        ...action,
        scheme: action.scheme ?? payment?.scheme ?? "native-transfer",
        asset: action.asset ?? payment?.asset ?? "SOL",
        network: action.network ?? payment?.network ?? "solana-devnet",
        recipient: action.recipient ?? payment?.payTo,
        resource: action.resource ?? payment?.resource,
      };
    }),
  };

  return {
    ...(runtime as unknown as PersistedRuntime),
    version: 4,
    mission: migratedMission as unknown as PersistedRuntime["mission"],
    receipts: runtime.receipts.map((candidate) => ({
      ...(candidate as Record<string, unknown>),
      approvalCapabilityId:
        (candidate as Record<string, unknown>).approvalCapabilityId ?? null,
    })) as unknown as PersistedRuntime["receipts"],
  };
}

export function loadWorkspace(): PersistedWorkspace | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.version === 1 && Array.isArray(parsed.runtimes)) {
        const runtimes = parsed.runtimes
          .map(migrateRuntime)
          .filter((runtime): runtime is PersistedRuntime => Boolean(runtime));
        if (runtimes.length > 0) {
          const requestedActive = typeof parsed.activeMissionId === "string"
            ? parsed.activeMissionId
            : "";
          return {
            version: 1,
            activeMissionId: runtimes.some(
              (runtime) => runtime.mission.id === requestedActive,
            )
              ? requestedActive
              : runtimes[0].mission.id,
            runtimes,
          };
        }
      }
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_RUNTIME_STORAGE_KEY);
    if (!legacyRaw) return null;
    const legacy = migrateRuntime(JSON.parse(legacyRaw));
    return legacy
      ? {
          version: 1,
          activeMissionId: legacy.mission.id,
          runtimes: [legacy],
        }
      : null;
  } catch {
    return null;
  }
}

export function saveWorkspace(workspace: PersistedWorkspace): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}

export function clearWorkspace(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WORKSPACE_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_RUNTIME_STORAGE_KEY);
}
