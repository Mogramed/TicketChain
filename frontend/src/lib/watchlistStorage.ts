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

function normalizeWatchKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const separatorIndex = trimmed.indexOf(":");
  if (separatorIndex === -1) {
    return normalizeTokenId(trimmed);
  }

  const eventId = trimmed.slice(0, separatorIndex).trim();
  const tokenId = trimmed.slice(separatorIndex + 1);
  if (!eventId) {
    return null;
  }

  const normalizedTokenId = normalizeTokenId(tokenId);
  return normalizedTokenId ? `${eventId}:${normalizedTokenId}` : null;
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
      .map((value) => normalizeWatchKey(value))
      .filter((value): value is string => value !== null);

    return new Set(normalized);
  } catch {
    return new Set<string>();
  }
}

export function saveWatchlist(values: Set<string>): void {
  try {
    const normalized = Array.from(values)
      .map((value) => normalizeWatchKey(value))
      .filter((value): value is string => value !== null)
      .sort((left, right) => left.localeCompare(right));

    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage or serialization errors.
  }
}
