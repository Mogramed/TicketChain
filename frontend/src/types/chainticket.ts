export interface ContractConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerTxBaseUrl: string;
  deploymentBlock: number;
  ticketNftAddress: string;
  marketplaceAddress: string;
  checkInRegistryAddress: string;
}

export type ChainEnv = "amoy" | "mainnet-ready";

export interface RuntimeConfig {
  apiBaseUrl: string | null;
  chainEnv: ChainEnv;
  featureFlags: string[];
}

export type UiMode = "guide" | "advanced";

export interface RouteGuideMeta {
  routeKey: "buy" | "resale" | "tickets" | "advanced";
  title: string;
  currentStep: string;
  recommendedAction: string;
  actionLabel: string;
  actionTo: string;
}

export interface WalletProviderInfo {
  id: string;
  name: string;
  icon?: string;
  rdns?: string;
  isMetaMask: boolean;
  provider: EthereumProvider;
}

export interface TicketView {
  tokenId: bigint;
  owner: string;
  used: boolean;
  tokenURI: string;
  listed: boolean;
  listingPrice: bigint | null;
}

export interface MarketplaceView {
  tokenId: bigint;
  seller: string;
  price: bigint;
  isActive: boolean;
}

export interface ListingHealth {
  tokenId: bigint;
  isActive: boolean;
  seller: string | null;
  price: bigint | null;
  used: boolean;
  sellerMatchesExpectation: boolean;
  priceMatchesExpectation: boolean;
  reason?: string;
}

export type PreflightAction =
  | { type: "mint" }
  | { type: "approve"; tokenId: bigint }
  | { type: "list"; tokenId: bigint; price: bigint }
  | { type: "cancel"; tokenId: bigint; expectedSeller?: string }
  | { type: "buy"; tokenId: bigint; price: bigint; expectedSeller?: string };

export interface PreflightResult {
  action: PreflightAction["type"];
  ok: boolean;
  blockers: string[];
  warnings: string[];
  gasEstimate: bigint | null;
  simulationPassed: boolean;
  listingHealth: ListingHealth | null;
  walletCapRemaining: bigint | null;
}

export type TicketTimelineKind =
  | "mint"
  | "transfer"
  | "listed"
  | "cancelled"
  | "sold"
  | "used"
  | "collectible";

export interface TicketTimelineEntry {
  id: string;
  tokenId: bigint;
  kind: TicketTimelineKind;
  blockNumber: number;
  txHash: string;
  timestamp: number | null;
  description: string;
  from?: string;
  to?: string;
  seller?: string;
  buyer?: string;
  scanner?: string;
  price?: bigint;
  feeAmount?: bigint;
}

export interface MarketStats {
  listingCount: number;
  floorPrice: bigint | null;
  medianPrice: bigint | null;
  maxPrice: bigint | null;
  averagePrice: bigint | null;
  suggestedListPrice: bigint | null;
}

export interface UserRoles {
  isAdmin: boolean;
  isScannerAdmin: boolean;
  isPauser: boolean;
  isScanner: boolean;
}

export interface ChainTicketEvent {
  type: "listed" | "cancelled" | "sold" | "transfer" | "used" | "collectible_mode";
  tokenId?: bigint;
  txHash?: string;
  blockNumber?: number;
}

export type TxStatus = "idle" | "pending" | "success" | "error";

export interface TxState {
  status: TxStatus;
  label?: string;
  hash?: string;
  errorReason?: string;
  timestamp: number;
}

export interface SystemState {
  primaryPrice: bigint;
  maxSupply: bigint;
  totalMinted: bigint;
  maxPerWallet: bigint;
  paused: boolean;
  collectibleMode: boolean;
}

export interface TxResponseLike {
  hash: string;
  wait: () => Promise<unknown>;
}

export interface PendingPreview {
  label: string;
  description: string;
  details: string[];
  preflight: PreflightResult | null;
  action?: PreflightAction;
  run: (client: ChainTicketClient) => Promise<TxResponseLike>;
}

export interface ChainTicketClient {
  discoverWallets: () => Promise<WalletProviderInfo[]>;
  getSystemState: () => Promise<SystemState>;
  getMyTickets: (owner: string) => Promise<TicketView[]>;
  getListings: () => Promise<MarketplaceView[]>;
  getMarketStats: () => Promise<MarketStats>;
  getTicketTimeline: (tokenId: bigint) => Promise<TicketTimelineEntry[]>;
  preflightAction: (action: PreflightAction) => Promise<PreflightResult>;
  watchEvents: (onEvent: (event: ChainTicketEvent) => void) => () => void;
  mintPrimary: () => Promise<TxResponseLike>;
  approveTicket: (tokenId: bigint) => Promise<TxResponseLike>;
  listTicket: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  cancelListing: (tokenId: bigint) => Promise<TxResponseLike>;
  buyTicket: (tokenId: bigint, price: bigint) => Promise<TxResponseLike>;
  getUserRoles?: (address: string) => Promise<UserRoles>;
  markTicketUsed?: (tokenId: bigint) => Promise<TxResponseLike>;
  grantScannerRole?: (account: string) => Promise<TxResponseLike>;
  revokeScannerRole?: (account: string) => Promise<TxResponseLike>;
  pauseSystem?: () => Promise<TxResponseLike>;
  unpauseSystem?: () => Promise<TxResponseLike>;
  setCollectibleMode?: (enabled: boolean) => Promise<TxResponseLike>;
}
