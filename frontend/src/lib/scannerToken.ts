export function extractTokenId(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed.length) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const fromQuery = trimmed.match(/[?&]tokenId=(\d+)/i);
  if (fromQuery?.[1]) {
    return fromQuery[1];
  }

  const fromPath = trimmed.match(/\/(\d+)(?:\D*)$/);
  if (fromPath?.[1]) {
    return fromPath[1];
  }

  const firstDigits = trimmed.match(/(\d{1,})/);
  return firstDigits?.[1] ?? null;
}
