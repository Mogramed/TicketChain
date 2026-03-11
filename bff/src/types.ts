export type IndexedEventType =
  | "transfer"
  | "listed"
  | "cancelled"
  | "sold"
  | "used"
  | "collectible_mode";

export interface IndexedEventBase {
  id: string;
  type: IndexedEventType;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  tokenId?: bigint;
  timestamp: number | null;
}

export interface TransferIndexedEvent extends IndexedEventBase {
  type: "transfer";
  tokenId: bigint;
  from: string;
  to: string;
}

export interface ListedIndexedEvent extends IndexedEventBase {
  type: "listed";
  tokenId: bigint;
  seller: string;
  price: bigint;
}

export interface CancelledIndexedEvent extends IndexedEventBase {
  type: "cancelled";
  tokenId: bigint;
  actor: string;
}

export interface SoldIndexedEvent extends IndexedEventBase {
  type: "sold";
  tokenId: bigint;
  seller: string;
  buyer: string;
  price: bigint;
  feeAmount: bigint;
}

export interface UsedIndexedEvent extends IndexedEventBase {
  type: "used";
  tokenId: bigint;
  scanner: string;
}

export interface CollectibleIndexedEvent extends IndexedEventBase {
  type: "collectible_mode";
  enabled: boolean;
}

export type IndexedEvent =
  | TransferIndexedEvent
  | ListedIndexedEvent
  | CancelledIndexedEvent
  | SoldIndexedEvent
  | UsedIndexedEvent
  | CollectibleIndexedEvent;

export interface ChainEventPayload {
  type: IndexedEventType;
  tokenId?: string;
  txHash: string;
  blockNumber: number;
}
