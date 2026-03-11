function cleanMessage(message: string): string {
  return message
    .replace(/^execution reverted:?\s*/i, "")
    .replace(/^VM Exception while processing transaction:\s*/i, "")
    .replace(/\(action="[^"]+".*$/i, "")
    .trim();
}

function valueToString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length ? value : undefined;
}

export function mapEthersError(error: unknown): string {
  if (typeof error === "string") {
    return cleanMessage(error);
  }

  if (!error || typeof error !== "object") {
    return "Unknown error.";
  }

  const candidate = error as {
    shortMessage?: unknown;
    reason?: unknown;
    message?: unknown;
    info?: { error?: { message?: unknown } };
    data?: { message?: unknown };
  };

  const rawMessage =
    valueToString(candidate.shortMessage) ??
    valueToString(candidate.reason) ??
    valueToString(candidate.info?.error?.message) ??
    valueToString(candidate.data?.message) ??
    valueToString(candidate.message);

  if (!rawMessage) {
    return "Transaction failed.";
  }

  const cleaned = cleanMessage(rawMessage);
  return cleaned.length ? cleaned : "Transaction failed.";
}
