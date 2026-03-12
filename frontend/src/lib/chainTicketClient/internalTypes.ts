import type { ChainTicketEvent, TxResponseLike } from "../../types/chainticket";

export interface BaseLogEvent {
  tokenId: bigint;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface TransferEvent extends BaseLogEvent {
  from: string;
  to: string;
}

export interface ListedEvent extends BaseLogEvent {
  seller: string;
  price: bigint;
}

export interface CancelledEvent extends BaseLogEvent {
  actor: string;
}

export interface SoldEvent extends BaseLogEvent {
  seller: string;
  buyer: string;
  price: bigint;
  feeAmount: bigint;
}

export interface UsedEvent extends BaseLogEvent {
  scanner: string;
}

export interface CollectibleModeEvent {
  enabled: boolean;
  blockNumber: number;
  logIndex: number;
  txHash: string;
}

export interface ListingValue {
  seller: string;
  price: bigint;
}

export interface TicketBindings {
  hasRole?: (role: string, account: string) => Promise<boolean>;
  primaryPrice: () => Promise<bigint>;
  maxSupply: () => Promise<bigint>;
  totalMinted: () => Promise<bigint>;
  maxPerWallet: () => Promise<bigint>;
  paused: () => Promise<boolean>;
  collectibleMode: () => Promise<boolean>;
  isUsed: (tokenId: bigint) => Promise<boolean>;
  tokenURI: (tokenId: bigint) => Promise<string>;
  ownerOf: (tokenId: bigint) => Promise<string>;
  mintPrimary: (value: bigint) => Promise<TxResponseLike>;
  approve: (spender: string, tokenId: bigint) => Promise<TxResponseLike>;
  pause?: () => Promise<TxResponseLike>;
  unpause?: () => Promise<TxResponseLike>;
  setCollectibleMode?: (enabled: boolean) => Promise<TxResponseLike>;
  queryTransferEvents: (owner: string, fromBlock: number) => Promise<TransferEvent[]>;
  balanceOf?: (owner: string) => Promise<bigint>;
  getApproved?: (tokenId: bigint) => Promise<string>;
  isApprovedForAll?: (owner: string, operator: string) => Promise<boolean>;
  queryTransferEventsByToken?: (tokenId: bigint, fromBlock: number) => Promise<TransferEvent[]>;
  queryCollectibleModeEvents?: (fromBlock: number) => Promise<CollectibleModeEvent[]>;
  simulateMint?: (value: bigint) => Promise<void>;
  estimateMintGas?: (value: bigint) => Promise<bigint>;
  simulateApprove?: (spender: string, tokenId: bigint) => Promise<void>;
  estimateApproveGas?: (spender: string, tokenId: bigint) => Promise<bigint>;
}

export interface MarketplaceBindings {
  list: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  cancel: (tokenId: bigint) => Promise<TxResponseLike>;
  buy: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  getListing: (tokenId: bigint) => Promise<ListingValue>;
  queryListedEvents: (fromBlock: number) => Promise<ListedEvent[]>;
  queryCancelledEvents?: (fromBlock: number) => Promise<CancelledEvent[]>;
  querySoldEvents?: (fromBlock: number) => Promise<SoldEvent[]>;
  simulateList?: (tokenId: bigint, price: bigint) => Promise<void>;
  estimateListGas?: (tokenId: bigint, price: bigint) => Promise<bigint>;
  simulateCancel?: (tokenId: bigint) => Promise<void>;
  estimateCancelGas?: (tokenId: bigint) => Promise<bigint>;
  simulateBuy?: (tokenId: bigint, price: bigint) => Promise<void>;
  estimateBuyGas?: (tokenId: bigint, price: bigint) => Promise<bigint>;
}

export interface CheckInBindings {
  hasRole?: (role: string, account: string) => Promise<boolean>;
  isUsed: (tokenId: bigint) => Promise<boolean>;
  markUsed?: (tokenId: bigint) => Promise<TxResponseLike>;
  grantScanner?: (account: string) => Promise<TxResponseLike>;
  revokeScanner?: (account: string) => Promise<TxResponseLike>;
  queryUsedEvents?: (tokenId: bigint, fromBlock: number) => Promise<UsedEvent[]>;
}

export interface ChainTicketBindings {
  ticket: TicketBindings;
  marketplace: MarketplaceBindings;
  checkInRegistry: CheckInBindings;
  getSignerAddress?: () => Promise<string>;
  hasSigner?: () => boolean;
  getBlockTimestamp?: (blockNumber: number) => Promise<number | null>;
  subscribeEvents?: (onEvent: (event: ChainTicketEvent) => void) => () => void;
}
