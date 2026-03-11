import type { ContractConfig, TicketTimelineEntry } from "../../types/chainticket";
import type { ChainTicketBindings } from "./internalTypes";
import { normalizeAddress, sameAddress, sortByBlockAndLog, ZERO_ADDRESS } from "./parsers";

export async function buildTicketTimeline(
  config: ContractConfig,
  bindings: ChainTicketBindings,
  tokenId: bigint,
): Promise<TicketTimelineEntry[]> {
  const transferEventsPromise = bindings.ticket.queryTransferEventsByToken
    ? bindings.ticket.queryTransferEventsByToken(tokenId, config.deploymentBlock)
    : Promise.resolve([]);

  const listedEventsPromise = bindings.marketplace.queryListedEvents(config.deploymentBlock).then((events) =>
    events.filter((event) => event.tokenId === tokenId),
  );

  const cancelledEventsPromise = bindings.marketplace.queryCancelledEvents
    ? bindings.marketplace
        .queryCancelledEvents(config.deploymentBlock)
        .then((events) => events.filter((event) => event.tokenId === tokenId))
    : Promise.resolve([]);

  const soldEventsPromise = bindings.marketplace.querySoldEvents
    ? bindings.marketplace
        .querySoldEvents(config.deploymentBlock)
        .then((events) => events.filter((event) => event.tokenId === tokenId))
    : Promise.resolve([]);

  const usedEventsPromise = bindings.checkInRegistry.queryUsedEvents
    ? bindings.checkInRegistry.queryUsedEvents(tokenId, config.deploymentBlock)
    : Promise.resolve([]);

  const collectibleEventsPromise = bindings.ticket.queryCollectibleModeEvents
    ? bindings.ticket.queryCollectibleModeEvents(config.deploymentBlock)
    : Promise.resolve([]);

  const [
    transferEvents,
    listedEvents,
    cancelledEvents,
    soldEvents,
    usedEvents,
    collectibleEvents,
  ] = await Promise.all([
    transferEventsPromise,
    listedEventsPromise,
    cancelledEventsPromise,
    soldEventsPromise,
    usedEventsPromise,
    collectibleEventsPromise,
  ]);

  const entriesWithOrder: Array<TicketTimelineEntry & { _logIndex: number }> = [];

  for (const event of transferEvents) {
    const isMint = sameAddress(event.from, ZERO_ADDRESS);
    entriesWithOrder.push({
      id: `${event.txHash}:${event.logIndex}:transfer`,
      tokenId,
      kind: isMint ? "mint" : "transfer",
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      timestamp: null,
      description: isMint
        ? `Primary mint to ${normalizeAddress(event.to)}`
        : `Transfer from ${normalizeAddress(event.from)} to ${normalizeAddress(event.to)}`,
      from: normalizeAddress(event.from),
      to: normalizeAddress(event.to),
      _logIndex: event.logIndex,
    });
  }

  for (const event of listedEvents) {
    entriesWithOrder.push({
      id: `${event.txHash}:${event.logIndex}:listed`,
      tokenId,
      kind: "listed",
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      timestamp: null,
      description: `Listed by ${normalizeAddress(event.seller)} at ${event.price.toString()} wei`,
      seller: normalizeAddress(event.seller),
      price: event.price,
      _logIndex: event.logIndex,
    });
  }

  for (const event of cancelledEvents) {
    entriesWithOrder.push({
      id: `${event.txHash}:${event.logIndex}:cancelled`,
      tokenId,
      kind: "cancelled",
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      timestamp: null,
      description: `Listing cancelled by ${normalizeAddress(event.actor)}`,
      _logIndex: event.logIndex,
    });
  }

  for (const event of soldEvents) {
    entriesWithOrder.push({
      id: `${event.txHash}:${event.logIndex}:sold`,
      tokenId,
      kind: "sold",
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      timestamp: null,
      description: `Sold from ${normalizeAddress(event.seller)} to ${normalizeAddress(event.buyer)}`,
      seller: normalizeAddress(event.seller),
      buyer: normalizeAddress(event.buyer),
      price: event.price,
      feeAmount: event.feeAmount,
      _logIndex: event.logIndex,
    });
  }

  for (const event of usedEvents) {
    entriesWithOrder.push({
      id: `${event.txHash}:${event.logIndex}:used`,
      tokenId,
      kind: "used",
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      timestamp: null,
      description: `Checked-in by scanner ${normalizeAddress(event.scanner)}`,
      scanner: normalizeAddress(event.scanner),
      _logIndex: event.logIndex,
    });
  }

  for (const event of collectibleEvents) {
    entriesWithOrder.push({
      id: `${event.txHash}:${event.logIndex}:collectible`,
      tokenId,
      kind: "collectible",
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      timestamp: null,
      description: event.enabled ? "Collectible mode enabled" : "Collectible mode disabled",
      _logIndex: event.logIndex,
    });
  }

  const sortedEntries = sortByBlockAndLog(
    entriesWithOrder.map((entry) => ({
      ...entry,
      logIndex: entry._logIndex,
    })),
  ).map((entry) => {
    const { logIndex, _logIndex, ...withoutOrder } = entry;
    void logIndex;
    void _logIndex;
    return withoutOrder;
  });

  if (bindings.getBlockTimestamp) {
    const blockCache = new Map<number, number | null>();
    await Promise.all(
      sortedEntries.map(async (entry) => {
        if (!blockCache.has(entry.blockNumber)) {
          blockCache.set(
            entry.blockNumber,
            (await bindings.getBlockTimestamp?.(entry.blockNumber)) ?? null,
          );
        }
      }),
    );

    for (const entry of sortedEntries) {
      entry.timestamp = blockCache.get(entry.blockNumber) ?? null;
    }
  }

  return sortedEntries.reverse();
}
