const WATCHLIST_STORAGE_KEY = "chainticket.watchlist.v1";

function normalizeTokenId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = BigInt(trimmed);
    return parsed >= 0n ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function loadWatchlist(): Set<string> {
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    const normalized = parsed
      .map((value) => normalizeTokenId(value))
      .filter((value): value is string => value !== null);

    return new Set(normalized);
  } catch {
    return new Set<string>();
  }
}

export function saveWatchlist(values: Set<string>): void {
  try {
    const normalized = Array.from(values)
      .map((value) => normalizeTokenId(value))
      .filter((value): value is string => value !== null)
      .sort((left, right) => (BigInt(left) < BigInt(right) ? -1 : 1));

    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage or serialization errors.
  }
}
