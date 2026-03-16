function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, "0");
}

export function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function buildDemoTokenSymbol(name: string, ticketEventId: string): string {
  const initials = name
    .split(/\s+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((word) => word.length > 0)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);

  const suffix = hashString(ticketEventId).slice(0, 2).toUpperCase();
  return `${initials || "CT"}${suffix}`.slice(0, 5);
}

export function buildDemoMetadataUri(root: string, ticketEventId: string, variant: "live" | "collectible"): string {
  const trimmed = root.trim();
  const normalizedRoot = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  return `${normalizedRoot}${ticketEventId}/${variant}/`;
}

export function parseFactoryAddressFromDeployOutput(output: string): string | null {
  const match = output.match(
    /(?:ChainTicketFactory(?: deployed)?|Using ChainTicketFactory):\s*(0x[a-fA-F0-9]{40})/,
  );
  return match?.[1] ?? null;
}
