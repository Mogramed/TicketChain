import type {
  BackendHealthSnapshot,
  ChainTicketEvent,
  OperationalActivity,
  OperationalRoleAssignment,
  OperationalSummary,
  EventDeployment,
  MarketStats,
  MarketplaceView,
  SystemState,
  TicketTimelineEntry,
  TicketView,
} from "../types/chainticket";

type ListingSort = "price_asc" | "price_desc" | "recent";

interface BffSystemPayload {
  primaryPriceWei: string;
  maxSupply: string;
  totalMinted: string;
  maxPerWallet: string;
  paused: boolean;
  collectibleMode: boolean;
  baseTokenURI?: string;
  collectibleBaseURI?: string;
}

interface BffListingPayload {
  tokenId: string;
  seller: string;
  priceWei: string;
  isActive: boolean;
}

interface BffMarketStatsPayload {
  listingCount: number;
  floorPriceWei: string | null;
  medianPriceWei: string | null;
  maxPriceWei: string | null;
  averagePriceWei: string | null;
  suggestedListPriceWei: string | null;
}

interface BffTicketPayload {
  tokenId: string;
  owner: string;
  used: boolean;
  tokenURI: string;
  listed: boolean;
  listingPriceWei: string | null;
}

interface BffTimelineEntryPayload {
  id: string;
  tokenId: string;
  kind: TicketTimelineEntry["kind"];
  blockNumber: number;
  txHash: string;
  timestamp: number | null;
  description: string;
  from?: string;
  to?: string;
  seller?: string;
  buyer?: string;
  scanner?: string;
  priceWei?: string;
  feeAmountWei?: string;
}

interface BffEventDeploymentPayload {
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

interface BffOperationalRolePayload {
  ticketEventId: string;
  contractScope: OperationalRoleAssignment["contractScope"];
  roleId: string;
  account: string;
  grantedBy: string | null;
  isActive: boolean;
  updatedBlock: number;
  updatedTxHash: string;
}

interface BffOperationalActivityPayload {
  id: string;
  ticketEventId: string;
  contractScope: OperationalActivity["contractScope"];
  type: OperationalActivity["type"];
  roleId: string | null;
  account: string | null;
  actor: string | null;
  blockNumber: number;
  txHash: string;
  timestamp: number | null;
}

interface BffHealthPayload {
  ok: boolean;
  degraded: boolean;
  checkedAt: number;
  indexedBlock: number;
  latestBlock: number | null;
  lag: number | null;
  stalenessMs: number | null;
  rpcHealthy: boolean;
  readModelReady: boolean;
  configuredDeploymentBlock: number;
  alerts: Array<{
    code: string;
    severity: "warning" | "critical";
    message: string;
  }>;
}

function toBigInt(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined) {
    return null;
  }
  return BigInt(value);
}

function parseSystem(payload: BffSystemPayload): SystemState {
  return {
    primaryPrice: BigInt(payload.primaryPriceWei),
    maxSupply: BigInt(payload.maxSupply),
    totalMinted: BigInt(payload.totalMinted),
    maxPerWallet: BigInt(payload.maxPerWallet),
    paused: payload.paused,
    collectibleMode: payload.collectibleMode,
    baseTokenURI: payload.baseTokenURI ?? "",
    collectibleBaseURI: payload.collectibleBaseURI ?? "",
  };
}

function parseListings(payload: BffListingPayload[]): MarketplaceView[] {
  return payload.map((item) => ({
    tokenId: BigInt(item.tokenId),
    seller: item.seller,
    price: BigInt(item.priceWei),
    isActive: item.isActive,
  }));
}

function parseStats(payload: BffMarketStatsPayload): MarketStats {
  return {
    listingCount: payload.listingCount,
    floorPrice: toBigInt(payload.floorPriceWei),
    medianPrice: toBigInt(payload.medianPriceWei),
    maxPrice: toBigInt(payload.maxPriceWei),
    averagePrice: toBigInt(payload.averagePriceWei),
    suggestedListPrice: toBigInt(payload.suggestedListPriceWei),
  };
}

function parseTickets(payload: BffTicketPayload[]): TicketView[] {
  return payload.map((item) => ({
    tokenId: BigInt(item.tokenId),
    owner: item.owner,
    used: item.used,
    tokenURI: item.tokenURI,
    listed: item.listed,
    listingPrice: toBigInt(item.listingPriceWei),
  }));
}

function parseTimeline(payload: BffTimelineEntryPayload[]): TicketTimelineEntry[] {
  return payload.map((item) => ({
    id: item.id,
    tokenId: BigInt(item.tokenId),
    kind: item.kind,
    blockNumber: item.blockNumber,
    txHash: item.txHash,
    timestamp: item.timestamp,
    description: item.description,
    from: item.from,
    to: item.to,
    seller: item.seller,
    buyer: item.buyer,
    scanner: item.scanner,
    price: toBigInt(item.priceWei) ?? undefined,
    feeAmount: toBigInt(item.feeAmountWei) ?? undefined,
  }));
}

function parseEvents(payload: BffEventDeploymentPayload[]): EventDeployment[] {
  return payload.map((item) => ({
    ticketEventId: item.ticketEventId,
    name: item.name,
    symbol: item.symbol,
    primaryPriceWei: item.primaryPriceWei,
    maxSupply: item.maxSupply,
    treasury: item.treasury,
    admin: item.admin,
    ticketNftAddress: item.ticketNftAddress,
    marketplaceAddress: item.marketplaceAddress,
    checkInRegistryAddress: item.checkInRegistryAddress,
    deploymentBlock: item.deploymentBlock,
    registeredAt: item.registeredAt,
    isDemoInspired: item.isDemoInspired ?? false,
    demoDisclaimer: item.demoDisclaimer ?? undefined,
    source: item.source,
    sourceEventId: item.sourceEventId,
    sourceUrl: item.sourceUrl ?? null,
    startsAt: item.startsAt ?? null,
    venueName: item.venueName ?? null,
    city: item.city ?? null,
    countryCode: item.countryCode ?? null,
    imageUrl: item.imageUrl ?? null,
    category: item.category ?? null,
  }));
}

function parseOperationalSummary(payload: {
  ticketEventId: string;
  roles: BffOperationalRolePayload[];
  recentActivity: BffOperationalActivityPayload[];
}): OperationalSummary {
  return {
    ticketEventId: payload.ticketEventId,
    roles: payload.roles.map((role) => ({
      ticketEventId: role.ticketEventId,
      contractScope: role.contractScope,
      roleId: role.roleId,
      account: role.account,
      grantedBy: role.grantedBy,
      isActive: role.isActive,
      updatedBlock: role.updatedBlock,
      updatedTxHash: role.updatedTxHash,
    })),
    recentActivity: payload.recentActivity.map((activity) => ({
      id: activity.id,
      ticketEventId: activity.ticketEventId,
      contractScope: activity.contractScope,
      type: activity.type,
      roleId: activity.roleId ?? undefined,
      account: activity.account ?? undefined,
      actor: activity.actor ?? undefined,
      blockNumber: activity.blockNumber,
      txHash: activity.txHash,
      timestamp: activity.timestamp,
    })),
  };
}

function parseHealth(payload: BffHealthPayload): BackendHealthSnapshot {
  return {
    ok: payload.ok,
    degraded: payload.degraded,
    checkedAt: payload.checkedAt,
    indexedBlock: payload.indexedBlock,
    latestBlock: payload.latestBlock,
    lag: payload.lag,
    stalenessMs: payload.stalenessMs,
    rpcHealthy: payload.rpcHealthy,
    readModelReady: payload.readModelReady,
    configuredDeploymentBlock: payload.configuredDeploymentBlock,
    alerts: payload.alerts.map((alert) => ({
      code: alert.code,
      severity: alert.severity,
      message: alert.message,
    })),
  };
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    query.set(key, String(value));
  }

  return query.size > 0 ? `?${query.toString()}` : "";
}

function parseStreamEvent(payload: unknown): ChainTicketEvent | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = payload as {
    type?: ChainTicketEvent["type"];
    ticketEventId?: string;
    tokenId?: string;
    txHash?: string;
    blockNumber?: number;
  };

  if (!value.type) {
    return null;
  }

  return {
    type: value.type,
    ticketEventId: value.ticketEventId,
    tokenId: value.tokenId ? BigInt(value.tokenId) : undefined,
    txHash: value.txHash,
    blockNumber: value.blockNumber,
  };
}

export class BffClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetchJson<T>(path: string, timeoutMs = 6500): Promise<T> {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`BFF request failed (${response.status}) on ${path}`);
      }

      return (await response.json()) as T;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async health(): Promise<BackendHealthSnapshot> {
    const payload = await this.fetchJson<BffHealthPayload>("/v1/health");
    return parseHealth(payload);
  }

  async listEvents(): Promise<{ items: EventDeployment[]; defaultEventId: string }> {
    const payload = await this.fetchJson<{
      items: BffEventDeploymentPayload[];
      defaultEventId: string;
    }>("/v1/events");

    return {
      items: parseEvents(payload.items),
      defaultEventId: payload.defaultEventId,
    };
  }

  async getSystemState(eventId?: string): Promise<SystemState> {
    const payload = await this.fetchJson<BffSystemPayload>(
      `/v1/system${buildQuery({ eventId })}`,
    );
    return parseSystem(payload);
  }

  async getListings(options: {
    eventId?: string;
    sort?: ListingSort;
    limit?: number;
    offset?: number;
  } = {}): Promise<MarketplaceView[]> {
    const suffix = buildQuery({
      eventId: options.eventId,
      sort: options.sort,
      limit: options.limit,
      offset: options.offset,
    });
    const payload = await this.fetchJson<{ items: BffListingPayload[] }>(`/v1/listings${suffix}`);
    return parseListings(payload.items);
  }

  async getMarketStats(eventId?: string): Promise<MarketStats> {
    const payload = await this.fetchJson<BffMarketStatsPayload>(
      `/v1/market/stats${buildQuery({ eventId })}`,
    );
    return parseStats(payload);
  }

  async getUserTickets(address: string, eventId?: string): Promise<TicketView[]> {
    const payload = await this.fetchJson<{ items: BffTicketPayload[] }>(
      `/v1/users/${address}/tickets${buildQuery({ eventId })}`,
    );
    return parseTickets(payload.items);
  }

  async getTicketTimeline(tokenId: bigint, eventId?: string): Promise<TicketTimelineEntry[]> {
    const payload = await this.fetchJson<{ items: BffTimelineEntryPayload[] }>(
      `/v1/tickets/${tokenId.toString()}/timeline${buildQuery({ eventId })}`,
    );
    return parseTimeline(payload.items);
  }

  async getOperationalSummary(eventId?: string): Promise<OperationalSummary> {
    const payload = await this.fetchJson<{
      ticketEventId: string;
      roles: BffOperationalRolePayload[];
      recentActivity: BffOperationalActivityPayload[];
    }>(`/v1/ops/summary${buildQuery({ eventId })}`);
    return parseOperationalSummary(payload);
  }

  watchEvents(
    onEvent: (event: ChainTicketEvent) => void,
    onError?: (error: unknown) => void,
    eventId?: string,
  ): () => void {
    const stream = new EventSource(
      `${this.baseUrl}/v1/events/stream${buildQuery({ eventId })}`,
    );

    const messageHandler = (message: MessageEvent<string>) => {
      try {
        const parsed = parseStreamEvent(JSON.parse(message.data));
        if (parsed) {
          onEvent(parsed);
        }
      } catch (error) {
        onError?.(error);
      }
    };

    const errorHandler = (error: unknown) => {
      onError?.(error);
    };

    stream.addEventListener("message", messageHandler as EventListener);
    stream.addEventListener("error", errorHandler as EventListener);

    return () => {
      stream.removeEventListener("message", messageHandler as EventListener);
      stream.removeEventListener("error", errorHandler as EventListener);
      stream.close();
    };
  }
}

export function createBffClient(baseUrl: string | null): BffClient | null {
  if (!baseUrl) {
    return null;
  }
  return new BffClient(baseUrl);
}
