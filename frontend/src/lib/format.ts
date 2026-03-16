import { formatEther, parseEther } from "ethers";

export function formatPol(value: bigint, precision = 4): string {
  const asEther = formatEther(value);
  const [whole, decimal = ""] = asEther.split(".");

  if (!decimal.length || precision <= 0) {
    return whole;
  }

  const trimmed = decimal.slice(0, precision).replace(/0+$/, "");
  return trimmed.length ? `${whole}.${trimmed}` : whole;
}

export function formatAddress(address: string, visibleChars = 4): string {
  if (!address || address.length < visibleChars * 2 + 2) {
    return address;
  }

  return `${address.slice(0, visibleChars + 2)}...${address.slice(-visibleChars)}`;
}

export function formatTokenId(tokenId: bigint): string {
  return `#${tokenId.toString()}`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

export function formatEventStart(timestamp: number | null | undefined): string {
  if (!timestamp) {
    return "Date to be announced";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function remainingSupply(maxSupply: bigint, totalMinted: bigint): bigint {
  const remaining = maxSupply - totalMinted;
  return remaining > 0n ? remaining : 0n;
}

export function parsePolInput(value: string): { ok: true; value: bigint } | { ok: false; error: string } {
  const normalized = value.trim().replace(",", ".");

  if (!normalized) {
    return { ok: false, error: "Enter a price in POL." };
  }

  try {
    const parsed = parseEther(normalized);
    if (parsed <= 0n) {
      return { ok: false, error: "Price must be greater than 0." };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: "Invalid POL amount." };
  }
}
