import { useCallback, useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { BffClient } from "../../lib/bffClient";
import { calculateMarketStats } from "../../lib/market";
import type {
  BackendHealthSnapshot,
  ChainTicketClient,
  ContractConfig,
  MarketStats,
  MarketplaceView,
  RuntimeConfig,
  SystemState,
  TicketView,
} from "../../types/chainticket";
import type { BffMode } from "./types";

interface DashboardQueriesArgs {
  readClient: ChainTicketClient | null;
  bffClient: BffClient | null;
  bffReadEnabled: boolean;
  contractConfig: ContractConfig;
  runtimeConfig: RuntimeConfig;
  walletAddress: string;
}

interface DashboardQueriesResult {
  bffMode: BffMode;
  bffHealth: BackendHealthSnapshot | null;
  indexedReadsAvailable: boolean;
  indexedReadsIssue: string | null;
  refetchBffHealth: () => Promise<void>;
  fetchWithFallback: <T>(fromBff: (() => Promise<T>) | null, fromRpc: () => Promise<T>) => Promise<T>;
  systemQuery: UseQueryResult<SystemState>;
  listingsQuery: UseQueryResult<MarketplaceView[]>;
  marketStatsQuery: UseQueryResult<MarketStats>;
  ticketsQuery: UseQueryResult<TicketView[]>;
  systemState: SystemState | null;
  listings: MarketplaceView[];
  marketStats: MarketStats | null;
  tickets: TicketView[];
  shouldRefetchRemoteMarketStats: boolean;
}

export function useDashboardQueries({
  readClient,
  bffClient,
  bffReadEnabled,
  contractConfig,
  runtimeConfig,
  walletAddress,
}: DashboardQueriesArgs): DashboardQueriesResult {
  const hasConfiguredBff = Boolean(bffClient);
  const bffHealthQuery = useQuery({
    queryKey: ["bff-health", runtimeConfig.apiBaseUrl],
    enabled: hasConfiguredBff,
    retry: 0,
    refetchInterval: hasConfiguredBff ? 15_000 : false,
    queryFn: async () => {
      if (!bffClient) {
        throw new Error("BFF health is unavailable.");
      }

      return bffClient.health();
    },
  });

  const bffHealth = bffHealthQuery.data ?? null;
  const effectiveBffMode: BffMode = useMemo(() => {
    if (!bffClient) {
      return "disabled";
    }
    if (!bffReadEnabled) {
      return "degraded";
    }
    if (bffHealthQuery.isError) {
      return "offline";
    }
    if (!bffHealth) {
      return "probing";
    }
    return bffHealth.readModelReady ? "online" : "degraded";
  }, [bffClient, bffHealth, bffHealthQuery.isError, bffReadEnabled]);
  const indexedReadsAvailable = !bffClient || (bffReadEnabled && bffHealth?.readModelReady === true);
  const indexedReadsIssue = useMemo(() => {
    if (!bffClient) {
      return null;
    }
    if (!bffReadEnabled) {
      return "The selected event is not yet available in the BFF read model.";
    }
    if (bffHealthQuery.isError) {
      return "The BFF health check failed, so indexed reads are temporarily unavailable.";
    }
    if (!bffHealth) {
      return "The BFF health check is still probing the backend.";
    }
    if (!bffHealth.readModelReady) {
      return (
        bffHealth.alerts[0]?.message ??
        `Indexer has not caught up past deployment block ${bffHealth.configuredDeploymentBlock}.`
      );
    }
    return null;
  }, [bffClient, bffHealth, bffHealthQuery.isError, bffReadEnabled]);
  const canPollRemoteCatalog = Boolean(bffClient && bffReadEnabled && effectiveBffMode === "online");
  const canReadFromBff = Boolean(bffClient && bffReadEnabled);
  const canReadSystemFromBff = Boolean(bffClient && bffReadEnabled && effectiveBffMode === "online");

  const fetchWithFallback = useCallback(
    async <T,>(fromBff: (() => Promise<T>) | null, fromRpc: () => Promise<T>): Promise<T> => {
      if (fromBff) {
        return fromBff();
      }

      return fromRpc();
    },
    [],
  );

  const systemQuery = useQuery({
    queryKey: [
      "system-state",
      contractConfig.chainId,
      contractConfig.eventId,
      runtimeConfig.apiBaseUrl,
      bffReadEnabled,
    ],
    enabled: hasConfiguredBff ? Boolean(canReadSystemFromBff) : Boolean(readClient),
    retry: 0,
    refetchInterval: hasConfiguredBff && canReadSystemFromBff ? 60_000 : false,
    queryFn: async () => {
      if (hasConfiguredBff) {
        if (!bffClient || !canReadSystemFromBff) {
          throw new Error("BFF system state is unavailable until the read model is ready.");
        }

        return bffClient.getSystemState(contractConfig.eventId);
      }

      if (!readClient) {
        throw new Error("Invalid contract config for system state.");
      }

      return fetchWithFallback(null, () => readClient.getSystemState());
    },
  });

  const listingsQuery = useQuery({
    queryKey: [
      "listings",
      contractConfig.chainId,
      contractConfig.eventId,
      runtimeConfig.apiBaseUrl,
      bffReadEnabled,
      effectiveBffMode,
    ],
    enabled: hasConfiguredBff ? indexedReadsAvailable : Boolean(readClient),
    retry: 0,
    refetchInterval: canPollRemoteCatalog ? 25_000 : false,
    queryFn: async () => {
      if (hasConfiguredBff) {
        if (!bffClient || !indexedReadsAvailable) {
          throw new Error("BFF listings are unavailable until the read model is ready.");
        }

        return fetchWithFallback(
          () =>
            bffClient.getListings({
              eventId: contractConfig.eventId,
              sort: "recent",
              limit: 200,
            }),
          () => Promise.resolve([] as MarketplaceView[]),
        );
      }

      if (!readClient) {
        throw new Error("Invalid contract config for listings.");
      }

      return fetchWithFallback(null, () => readClient.getListings());
    },
  });

  const marketStatsQuery = useQuery({
    queryKey: [
      "market-stats",
      contractConfig.chainId,
      contractConfig.eventId,
      runtimeConfig.apiBaseUrl,
      bffReadEnabled,
      effectiveBffMode,
    ],
    enabled: hasConfiguredBff ? indexedReadsAvailable : Boolean(readClient),
    retry: 0,
    refetchInterval: canPollRemoteCatalog ? 25_000 : false,
    queryFn: async () => {
      if (hasConfiguredBff) {
        if (!bffClient || !indexedReadsAvailable) {
          throw new Error("BFF market stats are unavailable until the read model is ready.");
        }

        return bffClient.getMarketStats(contractConfig.eventId);
      }

      if (!readClient) {
        throw new Error("Market stats are unavailable.");
      }

      return readClient.getMarketStats();
    },
  });

  const ticketsQuery = useQuery({
    queryKey: [
      "my-tickets",
      contractConfig.chainId,
      contractConfig.eventId,
      walletAddress,
      runtimeConfig.apiBaseUrl,
      bffReadEnabled,
      effectiveBffMode,
    ],
    enabled: hasConfiguredBff
      ? Boolean(walletAddress && indexedReadsAvailable && canReadFromBff)
      : Boolean(readClient && walletAddress),
    retry: 0,
    refetchInterval: walletAddress && canPollRemoteCatalog ? 25_000 : false,
    queryFn: async () => {
      if (!readClient || !walletAddress) {
        return [];
      }

      if (hasConfiguredBff) {
        if (!bffClient || !indexedReadsAvailable) {
          throw new Error("BFF tickets are unavailable until the read model is ready.");
        }

        return fetchWithFallback(
          () => bffClient.getUserTickets(walletAddress, contractConfig.eventId),
          () => Promise.resolve([] as TicketView[]),
        );
      }

      return fetchWithFallback(null, () => readClient.getMyTickets(walletAddress));
    },
  });

  const listings = useMemo(
    () => (hasConfiguredBff && !indexedReadsAvailable ? [] : listingsQuery.data ?? []),
    [hasConfiguredBff, indexedReadsAvailable, listingsQuery.data],
  );
  const tickets = useMemo(
    () => (hasConfiguredBff && !indexedReadsAvailable ? [] : ticketsQuery.data ?? []),
    [hasConfiguredBff, indexedReadsAvailable, ticketsQuery.data],
  );
  const systemState =
    hasConfiguredBff && !canReadSystemFromBff
      ? null
      : systemQuery.data ?? null;
  const derivedMarketStats = useMemo(
    () =>
      listings.length > 0
        ? calculateMarketStats(listings, systemState?.primaryPrice ?? null)
        : null,
    [listings, systemState?.primaryPrice],
  );

  return {
    bffMode: effectiveBffMode,
    bffHealth,
    indexedReadsAvailable,
    indexedReadsIssue,
    refetchBffHealth: async () => {
      await bffHealthQuery.refetch();
    },
    fetchWithFallback,
    systemQuery,
    listingsQuery,
    marketStatsQuery,
    ticketsQuery,
    systemState,
    listings,
    marketStats:
      hasConfiguredBff && !indexedReadsAvailable
        ? null
        : marketStatsQuery.data ?? derivedMarketStats,
    tickets,
    shouldRefetchRemoteMarketStats: Boolean(
      (hasConfiguredBff && effectiveBffMode === "online") || (!hasConfiguredBff && readClient),
    ),
  };
}
