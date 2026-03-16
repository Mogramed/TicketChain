import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { AppRouter } from "./AppRouter";

const useAppStateMock = vi.fn();
const useTicketScannerMock = vi.fn();

vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));

vi.mock("../lib/scanner", () => ({
  useTicketScanner: () => useTicketScannerMock(),
}));

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    walletProviders: [],
    selectedProviderId: "",
    setSelectedProviderId: vi.fn(),
    connectWallet: vi.fn(),
    disconnectWallet: vi.fn(),
    refreshDashboard: vi.fn(),
    walletAddress: "",
    walletChainId: null,
    contractConfig: {
      chainId: 80002,
      chainName: "Polygon Amoy",
      eventId: "main-event",
      eventName: "Paris Finals",
      ticketNftAddress: "0x0000000000000000000000000000000000000011",
      marketplaceAddress: "0x0000000000000000000000000000000000000022",
      checkInRegistryAddress: "0x0000000000000000000000000000000000000033",
      explorerTxBaseUrl: "https://amoy.polygonscan.com/tx/",
      deploymentBlock: 100,
      rpcUrl: "https://rpc-amoy.polygon.technology",
    },
    runtimeConfig: {
      apiBaseUrl: null,
      chainEnv: "amoy",
      featureFlags: [],
      defaultEventId: "main-event",
      factoryAddress: null,
      governanceTimelockAddress: null,
      governanceMinDelaySeconds: 0,
      governancePortalUrl: null,
    },
    availableEvents: [
      {
        ticketEventId: "main-event",
        name: "Paris Finals",
        symbol: "PF26",
        primaryPriceWei: "100000000000000000",
        maxSupply: "100",
        treasury: "0x0000000000000000000000000000000000000001",
        admin: "0x0000000000000000000000000000000000000002",
        ticketNftAddress: "0x0000000000000000000000000000000000000011",
        marketplaceAddress: "0x0000000000000000000000000000000000000022",
        checkInRegistryAddress: "0x0000000000000000000000000000000000000033",
        deploymentBlock: 100,
        registeredAt: 1700000000,
      },
    ],
    selectedEventId: "main-event",
    setSelectedEventId: vi.fn(),
    isConnecting: false,
    isRefreshing: false,
    statusMessage: "",
    errorMessage: "",
    bffMode: "disabled",
    indexedReadsIssue: null,
    hasValidConfig: true,
    configIssues: [],
    systemState: {
      primaryPrice: 100000000000000000n,
      maxSupply: 100n,
      totalMinted: 10n,
      maxPerWallet: 2n,
      paused: false,
      collectibleMode: false,
    },
    walletCapRemaining: 2n,
    venueSafeMode: false,
    userRoles: {
      isAdmin: true,
      isScannerAdmin: true,
      isPauser: true,
      isScanner: true,
    },
    listings: [],
    marketStats: {
      listingCount: 0,
      floorPrice: null,
      medianPrice: null,
      maxPrice: null,
      averagePrice: null,
      suggestedListPrice: null,
    },
    tickets: [],
    preparePreview: vi.fn(),
    setErrorMessage: vi.fn(),
    watchlist: new Set<string>(),
    toggleWatch: vi.fn(),
    pendingPreview: null,
    indexedReadsAvailable: true,
    fetchTicketTimeline: vi.fn().mockResolvedValue([]),
    txState: {
      status: "idle",
      timestamp: Date.now(),
    },
    uiMode: "guide",
    setVenueSafeMode: vi.fn(),
    setUiMode: vi.fn(),
    setOnboardingSeen: vi.fn(),
    onboardingSeen: true,
    selectedEventName: "Paris Finals",
    ...overrides,
  };
}

describe("AppRouter redirects", () => {
  function renderRouter(initialEntry: string) {
    return render(
      <I18nProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppRouter />
        </MemoryRouter>
      </I18nProvider>,
    );
  }

  it("redirects legacy /app/fan to Explore", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());
    useTicketScannerMock.mockReturnValue({
      mode: "manual",
      cameraEnabled: false,
      errorMessage: "",
      engineLabel: "Manual entry",
      start: vi.fn().mockResolvedValue({
        mode: "manual",
        cameraEnabled: false,
        errorMessage: "",
        engineLabel: "Manual entry",
        stop: vi.fn(),
      }),
      stop: vi.fn(),
    });

    renderRouter("/app/fan");
    expect(await screen.findByTestId("explore-page")).toBeInTheDocument();
  });

  it("redirects legacy /app/market to Marketplace", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());
    useTicketScannerMock.mockReturnValue({
      mode: "manual",
      cameraEnabled: false,
      errorMessage: "",
      engineLabel: "Manual entry",
      start: vi.fn().mockResolvedValue({
        mode: "manual",
        cameraEnabled: false,
        errorMessage: "",
        engineLabel: "Manual entry",
        stop: vi.fn(),
      }),
      stop: vi.fn(),
    });

    renderRouter("/app/market");
    expect(await screen.findByTestId("market-page")).toBeInTheDocument();
  });

  it("redirects legacy /app/scanner to organizer scanner", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());
    useTicketScannerMock.mockReturnValue({
      mode: "manual",
      cameraEnabled: false,
      errorMessage: "",
      engineLabel: "Manual entry",
      start: vi.fn().mockResolvedValue({
        mode: "manual",
        cameraEnabled: false,
        errorMessage: "",
        engineLabel: "Manual entry",
        stop: vi.fn(),
      }),
      stop: vi.fn(),
    });

    renderRouter("/app/scanner");
    expect(await screen.findByTestId("scanner-page")).toBeInTheDocument();
  });

  it("redirects legacy /app/advanced/settings to organizer settings", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());
    useTicketScannerMock.mockReturnValue({
      mode: "manual",
      cameraEnabled: false,
      errorMessage: "",
      engineLabel: "Manual entry",
      start: vi.fn().mockResolvedValue({
        mode: "manual",
        cameraEnabled: false,
        errorMessage: "",
        engineLabel: "Manual entry",
        stop: vi.fn(),
      }),
      stop: vi.fn(),
    });

    renderRouter("/app/advanced/settings");
    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
  });
});
