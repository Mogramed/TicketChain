import type { TxState } from "../types/chainticket";

const STORAGE_KEY = "chainticket.activity.v1";
const MAX_ITEMS = 40;

export function loadActivityHistory(): TxState[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as TxState[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => typeof item?.status === "string").slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveActivityHistory(history: TxState[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_ITEMS)));
  } catch {
    // Ignore storage quota or private mode issues.
  }
}
