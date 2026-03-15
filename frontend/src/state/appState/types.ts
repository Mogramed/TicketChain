import type { ChainTicketClientOptions } from "../../lib/chainTicketClient";
import type {
  BackendHealthSnapshot,
  ChainTicketClient,
  ContractConfig,
  EventDeployment,
  MarketplaceView,
  PendingPreview,
  PreflightAction,
  RuntimeConfig,
  SystemState,
  TicketTimelineEntry,
  TicketView,
  TxResponseLike,
  TxState,
  UiMode,
  UserRoles,
  WalletProviderInfo,
} from "../../types/chainticket";
import type { ConnectedWallet } from "../../lib/wallet";

export type BffMode = "disabled" | "probing" | "online" | "degraded" | "offline";

export type ClientFactory = (
  config: ContractConfig,
  options?: ChainTicketClientOptions,
) => ChainTicketClient;

export type WalletConnector = (
  config: ContractConfig,
  provider?: WalletProviderInfo,
) => Promise<ConnectedWallet>;

export interface PreparePreviewPayload {
  label: string;
  description: string;
  details: string[];
  action?: PreflightAction;
  run: (client: ChainTicketClient) => Promise<TxResponseLike>;
}

export interface AppStateContextValue {
  contractConfig: ContractConfig;
  runtimeConfig: RuntimeConfig;
  availableEvents: EventDeployment[];
  selectedEventId: string;
  setSelectedEventId: (eventId: string) => void;
  selectedEventName: string;
  bffSupportsSelectedEvent: boolean;
  bffHealth: BackendHealthSnapshot | null;
  indexedReadsAvailable: boolean;
  indexedReadsIssue: string | null;
  hasValidConfig: boolean;
  configIssues: string[];
  walletProviders: WalletProviderInfo[];
  selectedProviderId: string;
  setSelectedProviderId: (providerId: string) => void;
  connectedProvider: WalletProviderInfo | null;
  walletAddress: string;
  walletChainId: number | null;
  userRoles: UserRoles;
  isConnecting: boolean;
  isRefreshing: boolean;
  statusMessage: string;
  errorMessage: string;
  setErrorMessage: (message: string) => void;
  setStatusMessage: (message: string) => void;
  clearMessages: () => void;
  txState: TxState;
  activity: TxState[];
  watchlist: Set<string>;
  watchAlerts: string[];
  toggleWatch: (tokenId: bigint) => void;
  pendingPreview: PendingPreview | null;
  setPendingPreview: (preview: PendingPreview | null) => void;
  confirmPendingPreview: () => Promise<void>;
  preparePreview: (payload: PreparePreviewPayload) => Promise<void>;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  refreshDashboard: () => Promise<void>;
  fetchTicketTimeline: (tokenId: bigint) => Promise<TicketTimelineEntry[]>;
  systemState: SystemState | null;
  listings: MarketplaceView[];
  tickets: TicketView[];
  marketStats: {
    listingCount: number;
    floorPrice: bigint | null;
    medianPrice: bigint | null;
    maxPrice: bigint | null;
    averagePrice: bigint | null;
    suggestedListPrice: bigint | null;
  } | null;
  isLoadingSystem: boolean;
  isLoadingListings: boolean;
  isLoadingTickets: boolean;
  isLoadingMarketStats: boolean;
  walletCapRemaining: bigint | null;
  supplyLeft: bigint | null;
  lastChainEvent: string;
  bffMode: BffMode;
  venueSafeMode: boolean;
  setVenueSafeMode: (enabled: boolean) => void;
  uiMode: UiMode;
  setUiMode: (mode: UiMode) => void;
  onboardingSeen: boolean;
  setOnboardingSeen: (seen: boolean) => void;
}

export const EMPTY_ROLES: UserRoles = {
  isAdmin: false,
  isScannerAdmin: false,
  isPauser: false,
  isScanner: false,
};
