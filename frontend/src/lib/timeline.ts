import type { TicketTimelineEntry } from "../types/chainticket";

export function timelineLabel(kind: TicketTimelineEntry["kind"]): string {
  switch (kind) {
    case "mint":
      return "Primary Mint";
    case "transfer":
      return "Transfer";
    case "listed":
      return "Listed";
    case "cancelled":
      return "Listing Cancelled";
    case "sold":
      return "Sold";
    case "used":
      return "Checked-in";
    case "collectible":
      return "Collectible Mode";
    default:
      return "Event";
  }
}

export function parseTokenIdInput(value: string): bigint | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  try {
    const parsed = BigInt(normalized);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}
