import type { ChainTicketEvent } from "../../types/chainticket";

export function eventToLabel(event: ChainTicketEvent): string {
  const tokenLabel = event.tokenId !== undefined ? ` #${event.tokenId.toString()}` : "";
  const eventPrefix = event.ticketEventId ? `[${event.ticketEventId}] ` : "";

  switch (event.type) {
    case "listed":
      return `${eventPrefix}Live update: listed${tokenLabel}`;
    case "cancelled":
      return `${eventPrefix}Live update: cancelled${tokenLabel}`;
    case "sold":
      return `${eventPrefix}Live update: sold${tokenLabel}`;
    case "transfer":
      return `${eventPrefix}Live update: transfer${tokenLabel}`;
    case "used":
      return `${eventPrefix}Live update: checked-in${tokenLabel}`;
    case "collectible_mode":
      return `${eventPrefix}Live update: collectible mode changed`;
    default:
      return "Live update received";
  }
}
