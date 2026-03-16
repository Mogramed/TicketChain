export type IndexedEventType =
  | "transfer"
  | "listed"
  | "cancelled"
  | "sold"
  | "used"
  | "collectible_mode";

export type ContractScope = "ticket" | "checkin_registry";

export type OperationalActivityType =
  | "paused"
  | "unpaused"
  | "role_granted"
  | "role_revoked";

export interface TicketEventDeployment {
  ticketEventId: string;
  name: string;
  symbol: string;
  primaryPriceWei: string;
  maxSupply: string;
  treasury: string;
  admin: string;
  ticketNftAddress: string;
  marketplaceAddress: string;
  checkInRegistryAddress: string;
  deploymentBlock: number;
  registeredAt: number;
  isDemoInspired?: boolean;
  demoDisclaimer?: string;
  source?: "ticketmaster";
  sourceEventId?: string;
  sourceUrl?: string | null;
  startsAt?: number | null;
  venueName?: string | null;
  city?: string | null;
  countryCode?: string | null;
  imageUrl?: string | null;
  category?: string | null;
}

export type DemoLineupStatus = "active" | "staged";

export interface DemoCatalogEntry {
  lineupStatus: DemoLineupStatus;
  slotIndex: number;
  ticketEventId: string;
  source: "ticketmaster";
  sourceEventId: string;
  name: string;
  startsAt: number | null;
  venueName: string | null;
  city: string | null;
  countryCode: string | null;
  imageUrl: string | null;
  category: string | null;
  sourceUrl: string | null;
  fetchedAt: number;
  expiresAt: number;
  demoDisclaimer: string;
}

export interface IndexedEventBase {
  id: string;
  ticketEventId: string;
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
  ticketEventId: string;
  type: IndexedEventType;
  tokenId?: string;
  txHash: string;
  blockNumber: number;
}

export interface OperationalActivity {
  id: string;
  ticketEventId: string;
  contractScope: ContractScope;
  type: OperationalActivityType;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  timestamp: number | null;
  roleId?: string;
  account?: string;
  actor?: string;
}

export interface OperationalRoleAssignment {
  ticketEventId: string;
  contractScope: ContractScope;
  roleId: string;
  account: string;
  grantedBy: string | null;
  isActive: boolean;
  updatedBlock: number;
  updatedTxHash: string;
}
