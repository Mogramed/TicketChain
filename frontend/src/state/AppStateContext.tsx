import {
  useCallback,
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
import { discoverFactoryEvents, getFallbackEventDeployment } from "../lib/eventCatalog";
import { mapEthersError } from "../lib/errors";
import { remainingSupply } from "../lib/format";
import { connectBrowserWallet } from "../lib/wallet";
import type {
  ChainTicketEvent,
  ContractConfig,
  RuntimeConfig,
  TicketTimelineEntry,
} from "../types/chainticket";
import { AppStateValueContext } from "./AppStateValueContext";
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

export function AppStateProvider({
  children,
  contractConfig: baseContractConfig = CONTRACT_CONFIG,
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
  const [bffEventIds, setBffEventIds] = useState<string[]>([]);

  const fallbackEvent = useMemo(
    () => getFallbackEventDeployment(baseContractConfig),
    [baseContractConfig],
  );
  const [availableEvents, setAvailableEvents] = useState([fallbackEvent]);
  const [selectedEventId, setSelectedEventId] = useState(fallbackEvent.ticketEventId);

  const selectedEvent = useMemo(
    () =>
      availableEvents.find((event) => event.ticketEventId === selectedEventId) ??
      availableEvents[0] ??
      fallbackEvent,
    [availableEvents, fallbackEvent, selectedEventId],
  );

  const contractConfig = useMemo(
    () => ({
      ...baseContractConfig,
      eventId: selectedEvent.ticketEventId,
      eventName: selectedEvent.name,
      deploymentBlock:
        selectedEvent.deploymentBlock > 0
          ? selectedEvent.deploymentBlock
          : baseContractConfig.deploymentBlock,
      ticketNftAddress: selectedEvent.ticketNftAddress,
      marketplaceAddress: selectedEvent.marketplaceAddress,
      checkInRegistryAddress: selectedEvent.checkInRegistryAddress,
    }),
    [baseContractConfig, selectedEvent],
  );
  const bffSupportsSelectedEvent = bffEventIds.includes(selectedEvent.ticketEventId);

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

  useEffect(() => {
    let cancelled = false;

    const loadAvailableEvents = async () => {
      let nextEvents = [fallbackEvent];
      let nextPreferredEventId = runtimeConfig.defaultEventId;
      let nextBffEventIds: string[] = [];

      if (bffClient) {
        try {
          const response = await bffClient.listEvents();
          if (response.items.length > 0) {
            nextEvents = response.items;
          }
          nextPreferredEventId = response.defaultEventId;
          nextBffEventIds = response.items.map((event) => event.ticketEventId);
        } catch {
          // BFF event catalog is optional.
        }
      }

      if (
        nextEvents.length === 1 &&
        nextEvents[0]?.ticketEventId === fallbackEvent.ticketEventId &&
        runtimeConfig.factoryAddress &&
        !bffClient
      ) {
        try {
          const factoryEvents = await discoverFactoryEvents(
            baseContractConfig,
            runtimeConfig.factoryAddress,
          );
          if (factoryEvents.length > 0) {
            nextEvents = factoryEvents;
          }
        } catch {
          // Keep the fallback deployment when direct chain discovery is unavailable.
        }
      }

      if (cancelled) {
        return;
      }

      setBffEventIds(nextBffEventIds);
      setAvailableEvents(nextEvents);
      setSelectedEventId((current) => {
        if (nextEvents.some((event) => event.ticketEventId === current)) {
          return current;
        }

        return (
          nextEvents.find((event) => event.ticketEventId === nextPreferredEventId)?.ticketEventId ??
          nextEvents[0]?.ticketEventId ??
          fallbackEvent.ticketEventId
        );
      });
    };

    void loadAvailableEvents();

    return () => {
      cancelled = true;
    };
  }, [
    baseContractConfig,
    bffClient,
    fallbackEvent,
    runtimeConfig.defaultEventId,
    runtimeConfig.factoryAddress,
  ]);

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
  });

  const {
    bffMode,
    bffHealth,
    indexedReadsAvailable,
    indexedReadsIssue,
    refetchBffHealth,
    fetchWithFallback,
    systemQuery,
    listingsQuery,
    marketStatsQuery,
    ticketsQuery,
    systemState,
    listings,
    marketStats,
    tickets,
    shouldRefetchRemoteMarketStats,
  } = useDashboardQueries({
    readClient,
    bffClient,
    bffReadEnabled: bffSupportsSelectedEvent,
    contractConfig,
    runtimeConfig,
    walletAddress,
  });

  const refreshQueries = useCallback(async () => {
    await Promise.all([
      refetchBffHealth(),
      systemQuery.refetch(),
      listingsQuery.refetch(),
      shouldRefetchRemoteMarketStats ? marketStatsQuery.refetch() : Promise.resolve(null),
      walletAddress ? ticketsQuery.refetch() : Promise.resolve(null),
    ]);
  }, [
      listingsQuery,
      marketStatsQuery,
      refetchBffHealth,
      shouldRefetchRemoteMarketStats,
      systemQuery,
      ticketsQuery,
    walletAddress,
  ]);

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

  const { watchlist, watchAlerts, toggleWatch } = useWatchlistAlerts(
    contractConfig.eventId ?? runtimeConfig.defaultEventId,
    listings,
  );

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
      ticketsQuery.error;

    if (issue) {
      setErrorMessage(mapEthersError(issue));
    }
  }, [listingsQuery.error, systemQuery.error, ticketsQuery.error]);

  useEffect(() => {
    if (!bffClient || !bffSupportsSelectedEvent || bffMode !== "online") {
      return;
    }

    const onEvent = (event: ChainTicketEvent) => {
      setLastChainEvent(eventToLabel(event));
      invalidateDashboard();
    };

    const unsubscribeLive = bffClient.watchEvents(
      onEvent,
      () => {
        setErrorMessage("Live BFF event stream disconnected. Indexed reads stay paused until the stream reconnects.");
      },
      selectedEvent.ticketEventId,
    );

    return () => {
      unsubscribeLive();
    };
  }, [
    bffClient,
    bffMode,
    bffSupportsSelectedEvent,
    invalidateDashboard,
    selectedEvent.ticketEventId,
    setErrorMessage,
  ]);

  const fetchTicketTimeline = useCallback(
    async (tokenId: bigint): Promise<TicketTimelineEntry[]> => {
      if (!readClient && !bffClient) {
        return [];
      }

      if (bffClient && indexedReadsAvailable) {
        return fetchWithFallback(
          bffSupportsSelectedEvent
            ? () => bffClient.getTicketTimeline(tokenId, selectedEvent.ticketEventId)
            : null,
          () =>
            readClient
              ? readClient.getTicketTimeline(tokenId)
              : Promise.resolve([] as TicketTimelineEntry[]),
        );
      }

      if (!readClient) {
        return [];
      }

      return fetchWithFallback(null, () => readClient.getTicketTimeline(tokenId));
    },
    [
      bffClient,
      bffSupportsSelectedEvent,
      fetchWithFallback,
      indexedReadsAvailable,
      readClient,
      selectedEvent.ticketEventId,
    ],
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
      availableEvents,
      selectedEventId,
      setSelectedEventId,
      selectedEventName: selectedEvent.name,
      bffSupportsSelectedEvent,
      bffHealth,
      indexedReadsAvailable,
      indexedReadsIssue,
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
      availableEvents,
      bffHealth,
      bffSupportsSelectedEvent,
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
      indexedReadsAvailable,
      indexedReadsIssue,
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
      selectedEvent.name,
      selectedEventId,
      setSelectedEventId,
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

  return <AppStateValueContext.Provider value={value}>{children}</AppStateValueContext.Provider>;
}
