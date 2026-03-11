import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import type { BffClient } from "../../lib/bffClient";
import type {
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
  contractConfig: ContractConfig;
  runtimeConfig: RuntimeConfig;
  walletAddress: string;
}

interface DashboardQueriesResult {
  bffMode: BffMode;
  setBffMode: Dispatch<SetStateAction<BffMode>>;
  fetchWithFallback: <T>(fromBff: (() => Promise<T>) | null, fromRpc: () => Promise<T>) => Promise<T>;
  systemQuery: UseQueryResult<SystemState>;
  listingsQuery: UseQueryResult<MarketplaceView[]>;
  marketStatsQuery: UseQueryResult<MarketStats>;
  ticketsQuery: UseQueryResult<TicketView[]>;
  systemState: SystemState | null;
  listings: MarketplaceView[];
  marketStats: MarketStats | null;
  tickets: TicketView[];
}

export function useDashboardQueries({
  readClient,
  bffClient,
  contractConfig,
  runtimeConfig,
  walletAddress,
}: DashboardQueriesArgs): DashboardQueriesResult {
  const [bffMode, setBffMode] = useState<BffMode>(bffClient ? "probing" : "disabled");

  const fetchWithFallback = useCallback(
    async <T,>(fromBff: (() => Promise<T>) | null, fromRpc: () => Promise<T>): Promise<T> => {
      if (fromBff) {
        try {
          const fromApi = await fromBff();
          setBffMode("online");
          return fromApi;
        } catch {
          setBffMode("offline");
        }
      }

      return fromRpc();
    },
    [],
  );

  const systemQuery = useQuery({
    queryKey: ["system-state", contractConfig.chainId, runtimeConfig.apiBaseUrl],
    enabled: Boolean(readClient),
    retry: 1,
    refetchInterval: 25_000,
    queryFn: async () => {
      if (!readClient) {
        throw new Error("Invalid contract config for system state.");
      }

      return fetchWithFallback(
        bffClient ? () => bffClient.getSystemState() : null,
        () => readClient.getSystemState(),
      );
    },
  });

  const listingsQuery = useQuery({
    queryKey: ["listings", contractConfig.chainId, runtimeConfig.apiBaseUrl],
    enabled: Boolean(readClient),
    retry: 1,
    refetchInterval: 25_000,
    queryFn: async () => {
      if (!readClient) {
        throw new Error("Invalid contract config for listings.");
      }

      return fetchWithFallback(
        bffClient ? () => bffClient.getListings({ sort: "recent", limit: 200 }) : null,
        () => readClient.getListings(),
      );
    },
  });

  const marketStatsQuery = useQuery({
    queryKey: ["market-stats", contractConfig.chainId, runtimeConfig.apiBaseUrl],
    enabled: Boolean(readClient),
    retry: 1,
    refetchInterval: 25_000,
    queryFn: async () => {
      if (!readClient) {
        throw new Error("Invalid contract config for market stats.");
      }

      return fetchWithFallback(
        bffClient ? () => bffClient.getMarketStats() : null,
        () => readClient.getMarketStats(),
      );
    },
  });

  const ticketsQuery = useQuery({
    queryKey: ["my-tickets", contractConfig.chainId, walletAddress, runtimeConfig.apiBaseUrl],
    enabled: Boolean(readClient && walletAddress),
    retry: 1,
    refetchInterval: 25_000,
    queryFn: async () => {
      if (!readClient || !walletAddress) {
        return [];
      }

      return fetchWithFallback(
        bffClient ? () => bffClient.getUserTickets(walletAddress) : null,
        () => readClient.getMyTickets(walletAddress),
      );
    },
  });

  const listings = useMemo(() => listingsQuery.data ?? [], [listingsQuery.data]);
  const tickets = useMemo(() => ticketsQuery.data ?? [], [ticketsQuery.data]);

  return {
    bffMode,
    setBffMode,
    fetchWithFallback,
    systemQuery,
    listingsQuery,
    marketStatsQuery,
    ticketsQuery,
    systemState: systemQuery.data ?? null,
    listings,
    marketStats: marketStatsQuery.data ?? null,
    tickets,
  };
}
