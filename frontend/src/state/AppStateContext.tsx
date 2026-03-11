/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";

import { CONTRACT_CONFIG, validateContractConfig } from "../config/contracts";
import { RUNTIME_CONFIG } from "../config/runtime";
import { createBffClient } from "../lib/bffClient";
import { createChainTicketClient } from "../lib/chainTicketClient";
import { mapEthersError } from "../lib/errors";
import { remainingSupply } from "../lib/format";
import { connectBrowserWallet } from "../lib/wallet";
import type {
  ChainTicketEvent,
  ContractConfig,
  RuntimeConfig,
  TicketTimelineEntry,
} from "../types/chainticket";
import { useDashboardQueries } from "./appState/dashboardQueries";
import { eventToLabel } from "./appState/eventLabel";
import { useUiPreferences } from "./appState/preferences";
import { useTransactionState } from "./appState/transactions";
import {
  type AppStateContextValue,
  type ClientFactory,
  type WalletConnector,
} from "./appState/types";
import { useWalletSession } from "./appState/walletSession";
import { useWatchlistAlerts } from "./appState/watchlistAlerts";

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({
  children,
  contractConfig = CONTRACT_CONFIG,
  runtimeConfig = RUNTIME_CONFIG,
  createClient = createChainTicketClient,
  walletConnector = connectBrowserWallet,
}: {
  children: ReactNode;
  contractConfig?: ContractConfig;
  runtimeConfig?: RuntimeConfig;
  createClient?: ClientFactory;
  walletConnector?: WalletConnector;
}) {
  const queryClient = useQueryClient();

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastChainEvent, setLastChainEvent] = useState("No live event yet.");

  const configIssues = useMemo(() => validateContractConfig(contractConfig), [contractConfig]);
  const hasValidConfig = configIssues.length === 0;

  const readClient = useMemo(
    () => (hasValidConfig ? createClient(contractConfig) : null),
    [createClient, contractConfig, hasValidConfig],
  );

  const bffClient = useMemo(
    () => createBffClient(runtimeConfig.apiBaseUrl),
    [runtimeConfig.apiBaseUrl],
  );

  const clearMessages = useCallback(() => {
    setStatusMessage("");
    setErrorMessage("");
  }, []);

  const invalidateDashboard = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["system-state"] });
    void queryClient.invalidateQueries({ queryKey: ["listings"] });
    void queryClient.invalidateQueries({ queryKey: ["market-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
  }, [queryClient]);

  const {
    walletProviders,
    selectedProviderId,
    setSelectedProviderId,
    connectedProvider,
    walletAddress,
    walletChainId,
    walletClient,
    userRoles,
    isConnecting,
    connectWallet,
    disconnectWallet,
  } = useWalletSession({
    contractConfig,
    hasValidConfig,
    createClient,
    walletConnector,
    readClient,
    clearMessages,
    setErrorMessage,
    setStatusMessage,
    invalidateDashboard,
  });

  const {
    bffMode,
    setBffMode,
    fetchWithFallback,
    systemQuery,
    listingsQuery,
    marketStatsQuery,
    ticketsQuery,
    systemState,
    listings,
    marketStats,
    tickets,
  } = useDashboardQueries({
    readClient,
    bffClient,
    contractConfig,
    runtimeConfig,
    walletAddress,
  });

  const refreshQueries = useCallback(async () => {
    await Promise.all([
      systemQuery.refetch(),
      listingsQuery.refetch(),
      marketStatsQuery.refetch(),
      walletAddress ? ticketsQuery.refetch() : Promise.resolve(null),
    ]);
  }, [listingsQuery, marketStatsQuery, systemQuery, ticketsQuery, walletAddress]);

  const {
    txState,
    activity,
    pendingPreview,
    isRefreshing,
    refreshDashboard,
    preparePreview,
    confirmPendingPreview,
    setPendingPreview,
  } = useTransactionState({
    walletClient,
    clearMessages,
    setErrorMessage,
    setStatusMessage,
    refreshQueries,
  });

  const { watchlist, watchAlerts, toggleWatch } = useWatchlistAlerts(listings);

  const {
    venueSafeMode,
    setVenueSafeMode,
    uiMode,
    setUiMode,
    onboardingSeen,
    setOnboardingSeen,
  } = useUiPreferences();

  useEffect(() => {
    const issue =
      systemQuery.error ??
      listingsQuery.error ??
      marketStatsQuery.error ??
      ticketsQuery.error;

    if (issue) {
      setErrorMessage(mapEthersError(issue));
    }
  }, [listingsQuery.error, marketStatsQuery.error, systemQuery.error, ticketsQuery.error]);

  useEffect(() => {
    if (!readClient) {
      return;
    }

    const onEvent = (event: ChainTicketEvent) => {
      setLastChainEvent(eventToLabel(event));
      invalidateDashboard();
    };

    const unsubscribeRpc = readClient.watchEvents(onEvent);
    const unsubscribeSse = bffClient
      ? bffClient.watchEvents(onEvent, () => {
          setBffMode("offline");
        })
      : () => undefined;

    const pollingId = window.setInterval(() => {
      invalidateDashboard();
    }, 25_000);

    return () => {
      unsubscribeRpc();
      unsubscribeSse();
      window.clearInterval(pollingId);
    };
  }, [bffClient, invalidateDashboard, readClient, setBffMode]);

  const fetchTicketTimeline = useCallback(
    async (tokenId: bigint): Promise<TicketTimelineEntry[]> => {
      if (!readClient) {
        return [];
      }

      return fetchWithFallback(
        bffClient ? () => bffClient.getTicketTimeline(tokenId) : null,
        () => readClient.getTicketTimeline(tokenId),
      );
    },
    [bffClient, fetchWithFallback, readClient],
  );

  const walletCapRemaining = useMemo(() => {
    if (!systemState) {
      return null;
    }
    const remaining = systemState.maxPerWallet - BigInt(tickets.length);
    return remaining > 0n ? remaining : 0n;
  }, [systemState, tickets.length]);

  const supplyLeft = useMemo(() => {
    if (!systemState) {
      return null;
    }
    return remainingSupply(systemState.maxSupply, systemState.totalMinted);
  }, [systemState]);

  const value = useMemo<AppStateContextValue>(
    () => ({
      contractConfig,
      runtimeConfig,
      hasValidConfig,
      configIssues,
      walletProviders,
      selectedProviderId,
      setSelectedProviderId,
      connectedProvider,
      walletAddress,
      walletChainId,
      userRoles,
      isConnecting,
      isRefreshing,
      statusMessage,
      errorMessage,
      setErrorMessage,
      setStatusMessage,
      clearMessages,
      txState,
      activity,
      watchlist,
      watchAlerts,
      toggleWatch,
      pendingPreview,
      setPendingPreview,
      confirmPendingPreview,
      preparePreview,
      connectWallet,
      disconnectWallet,
      refreshDashboard,
      fetchTicketTimeline,
      systemState,
      listings,
      tickets,
      marketStats,
      isLoadingSystem: systemQuery.isLoading || systemQuery.isFetching,
      isLoadingListings: listingsQuery.isLoading || listingsQuery.isFetching,
      isLoadingTickets: ticketsQuery.isLoading || ticketsQuery.isFetching,
      isLoadingMarketStats: marketStatsQuery.isLoading || marketStatsQuery.isFetching,
      walletCapRemaining,
      supplyLeft,
      lastChainEvent,
      bffMode,
      venueSafeMode,
      setVenueSafeMode,
      uiMode,
      setUiMode,
      onboardingSeen,
      setOnboardingSeen,
    }),
    [
      activity,
      bffMode,
      configIssues,
      clearMessages,
      connectWallet,
      confirmPendingPreview,
      connectedProvider,
      contractConfig,
      disconnectWallet,
      errorMessage,
      fetchTicketTimeline,
      hasValidConfig,
      isConnecting,
      isRefreshing,
      lastChainEvent,
      listings,
      listingsQuery.isFetching,
      listingsQuery.isLoading,
      marketStats,
      marketStatsQuery.isFetching,
      marketStatsQuery.isLoading,
      pendingPreview,
      preparePreview,
      refreshDashboard,
      runtimeConfig,
      selectedProviderId,
      setSelectedProviderId,
      setPendingPreview,
      setOnboardingSeen,
      setUiMode,
      setVenueSafeMode,
      statusMessage,
      supplyLeft,
      systemQuery.isFetching,
      systemQuery.isLoading,
      systemState,
      tickets,
      ticketsQuery.isFetching,
      ticketsQuery.isLoading,
      toggleWatch,
      txState,
      onboardingSeen,
      uiMode,
      userRoles,
      venueSafeMode,
      walletAddress,
      walletCapRemaining,
      walletChainId,
      walletProviders,
      watchAlerts,
      watchlist,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider.");
  }
  return context;
}
