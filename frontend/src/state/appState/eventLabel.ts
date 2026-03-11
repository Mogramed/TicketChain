import type { ChainTicketEvent } from "../../types/chainticket";

export function eventToLabel(event: ChainTicketEvent): string {
  const tokenLabel = event.tokenId !== undefined ? ` #${event.tokenId.toString()}` : "";

  switch (event.type) {
    case "listed":
      return `Live update: listed${tokenLabel}`;
    case "cancelled":
      return `Live update: cancelled${tokenLabel}`;
    case "sold":
      return `Live update: sold${tokenLabel}`;
    case "transfer":
      return `Live update: transfer${tokenLabel}`;
    case "used":
      return `Live update: checked-in${tokenLabel}`;
    case "collectible_mode":
      return "Live update: collectible mode changed";
    default:
      return "Live update received";
  }
}
