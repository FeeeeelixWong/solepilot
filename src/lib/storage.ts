import type { PersistedRuntime } from "./types";

export const RUNTIME_STORAGE_KEY = "solepilot.runtime.v3";

export function loadRuntime(): PersistedRuntime | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(RUNTIME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRuntime;
    if (
      parsed.version !== 3 ||
      !parsed.mission?.id ||
      !Array.isArray(parsed.mission.actions) ||
      !Array.isArray(parsed.receipts) ||
      !Array.isArray(parsed.artifacts)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRuntime(runtime: PersistedRuntime): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(runtime));
}

export function clearRuntime(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RUNTIME_STORAGE_KEY);
}
