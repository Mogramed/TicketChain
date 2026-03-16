import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserProvider, parseEther, type Provider, type Signer } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppStateProvider } from "./AppStateContext";
import { useAppState } from "./useAppState";
import type {
  ChainTicketClient,
  ContractConfig,
  RuntimeConfig,
  TxResponseLike,
  WalletProviderInfo,
} from "../types/chainticket";

const config: ContractConfig = {
  chainId: 80002,
  chainName: "Polygon Amoy",
  rpcUrl: "https://rpc-amoy.polygon.technology",
  explorerTxBaseUrl: "https://amoy.polygonscan.com/tx/",
  deploymentBlock: 100,
  ticketNftAddress: "0x0000000000000000000000000000000000000011",
  marketplaceAddress: "0x0000000000000000000000000000000000000022",
  checkInRegistryAddress: "0x0000000000000000000000000000000000000033",
};

const providerInfo: WalletProviderInfo = {
  id: "wallet-1",
  name: "MetaMask",
  isMetaMask: true,
  provider: {
    isMetaMask: true,
    request: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
};

function tx(hash: string): TxResponseLike {
  return {
    hash,
    wait: vi.fn().mockResolvedValue(undefined),
  };
}

function makeClient(overrides: Partial<ChainTicketClient> = {}): ChainTicketClient {
  return {
    discoverWallets: vi.fn().mockResolvedValue([providerInfo]),
    getSystemState: vi.fn().mockResolvedValue({
      primaryPrice: parseEther("0.1"),
      maxSupply: 100n,
      totalMinted: 12n,
      maxPerWallet: 2n,
      paused: false,
      collectibleMode: false,
    }),
    getMyTickets: vi.fn().mockResolvedValue([]),
    getListings: vi.fn().mockResolvedValue([]),
    getMarketStats: vi.fn().mockResolvedValue({
      listingCount: 0,
      floorPrice: null,
      medianPrice: null,
      maxPrice: null,
      averagePrice: null,
      suggestedListPrice: null,
    }),
    getTicketTimeline: vi.fn().mockResolvedValue([]),
    preflightAction: vi.fn().mockResolvedValue({
      action: "mint",
      ok: true,
      blockers: [],
      warnings: [],
      gasEstimate: 120000n,
      simulationPassed: true,
      listingHealth: null,
      walletCapRemaining: 1n,
    }),
    watchEvents: vi.fn().mockReturnValue(() => undefined),
    mintPrimary: vi.fn().mockResolvedValue(tx("0xmint")),
    approveTicket: vi.fn().mockResolvedValue(tx("0xapprove")),
    listTicket: vi.fn().mockResolvedValue(tx("0xlist")),
    listTicketWithPermit: vi.fn().mockResolvedValue(tx("0xlist-permit")),
    cancelListing: vi.fn().mockResolvedValue(tx("0xcancel")),
    buyTicket: vi.fn().mockResolvedValue(tx("0xbuy")),
    getUserRoles: vi.fn().mockResolvedValue({
      isAdmin: false,
      isScannerAdmin: false,
      isPauser: false,
      isScanner: false,
    }),
    markTicketUsed: vi.fn().mockResolvedValue(tx("0xused")),
    grantScannerRole: vi.fn().mockResolvedValue(tx("0xgrant-scanner")),
    revokeScannerRole: vi.fn().mockResolvedValue(tx("0xrevoke-scanner")),
    pauseSystem: vi.fn().mockResolvedValue(tx("0xpause")),
    unpauseSystem: vi.fn().mockResolvedValue(tx("0xunpause")),
    setCollectibleMode: vi.fn().mockResolvedValue(tx("0xcollectible")),
    ...overrides,
  };
}

function Probe() {
  const state = useAppState();

  return (
    <div>
      <div data-testid="wallet-address">{state.walletAddress || "none"}</div>
      <div data-testid="status-message">{state.statusMessage || "none"}</div>
      <div data-testid="error-message">{state.errorMessage || "none"}</div>
      <div data-testid="bff-mode">{state.bffMode}</div>
      <div data-testid="tx-status">{state.txState.status}</div>
      <div data-testid="activity-count">{state.activity.length}</div>
      <div data-testid="ticket-count">{state.tickets.length}</div>

      <button type="button" onClick={() => void state.connectWallet()}>
        connect
      </button>
      <button type="button" onClick={state.disconnectWallet}>
        disconnect
      </button>
      <button type="button" onClick={() => void state.refreshDashboard()}>
        refresh
      </button>
      <button
        type="button"
        onClick={() =>
          void state.preparePreview({
            label: "Mint success",
            description: "Mint preview",
            details: [],
            action: { type: "mint" },
            run: (client) => client.mintPrimary(),
          })
        }
      >
        preview-success
      </button>
      <button
        type="button"
        onClick={() =>
          void state.preparePreview({
            label: "Mint failure",
            description: "Mint preview",
            details: [],
            action: { type: "mint" },
            run: async () => {
              throw new Error("forced failure");
            },
          })
        }
      >
        preview-failure
      </button>
      <button type="button" onClick={() => void state.confirmPendingPreview()}>
        confirm
      </button>
    </div>
  );
}

function renderWithProvider({
  runtimeConfig,
  createClient,
  walletConnector,
}: {
  runtimeConfig: RuntimeConfig;
  createClient: (
    cfg: ContractConfig,
    options?: { signer?: Signer; readProvider?: Provider },
  ) => ChainTicketClient;
  walletConnector?: (
    cfg: ContractConfig,
    provider?: WalletProviderInfo,
  ) => Promise<{
    signer: Signer;
    provider: BrowserProvider;
    address: string;
    chainId: number;
    providerInfo: WalletProviderInfo;
  }>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppStateProvider
        contractConfig={config}
        runtimeConfig={runtimeConfig}
        createClient={createClient}
        walletConnector={walletConnector}
      >
        <Probe />
      </AppStateProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("AppStateProvider", () => {
  it("connects and disconnects wallet while resetting session state", async () => {
    const readClient = makeClient();
    const walletClient = makeClient();

    const createClient = vi.fn(
      (_cfg: ContractConfig, options?: { signer?: Signer; readProvider?: Provider }) =>
        options?.signer ? walletClient : readClient,
    );

    const walletConnector = vi.fn().mockResolvedValue({
      signer: {} as Signer,
      provider: {} as BrowserProvider,
      address: "0x00000000000000000000000000000000000000AA",
      chainId: 80002,
      providerInfo,
    });

    renderWithProvider({
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
      createClient,
      walletConnector,
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("wallet-address")).toHaveTextContent("0x00000000000000000000000000000000000000AA");
    });
    await waitFor(() => {
      expect(createClient).toHaveBeenCalledTimes(2);
    });
    expect(createClient).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ...config,
        eventId: "main-event",
        eventName: "Main Event",
      }),
      expect.objectContaining({
        signer: expect.anything(),
        readProvider: expect.anything(),
      }),
    );

    await user.click(screen.getByRole("button", { name: "disconnect" }));

    expect(screen.getByTestId("wallet-address")).toHaveTextContent("none");
    expect(screen.getByTestId("status-message")).toHaveTextContent("Wallet disconnected.");
  });

  it("uses direct chain reads while the BFF stays degraded, then switches back once indexed reads recover", async () => {
    const eventSourceUrls: string[] = [];

    class FakeEventSource {
      constructor(url: string | URL) {
        eventSourceUrls.push(String(url));
      }

      addEventListener() {}
      removeEventListener() {}
      close() {}
    }

    vi.stubGlobal("EventSource", FakeEventSource);

    const getSystemStateMock = vi.fn().mockResolvedValue({
      primaryPrice: parseEther("0.15"),
      maxSupply: 120n,
      totalMinted: 10n,
      maxPerWallet: 2n,
      paused: false,
      collectibleMode: false,
    });
    const getListingsMock = vi.fn().mockResolvedValue([]);
    const getMyTicketsMock = vi.fn().mockResolvedValue([
      {
        tokenId: 7n,
        owner: "0x00000000000000000000000000000000000000AA",
        used: false,
        tokenURI: "ipfs://ticket/base/7.json",
        listed: false,
        listingPrice: null,
      },
    ]);
    const readClient = makeClient({
      getSystemState: getSystemStateMock,
      getListings: getListingsMock,
      getMyTickets: getMyTicketsMock,
    });

    const createClient = vi.fn(() => readClient);
    const walletConnector = vi.fn().mockResolvedValue({
      signer: {} as Signer,
      provider: {} as BrowserProvider,
      address: "0x00000000000000000000000000000000000000AA",
      chainId: 80002,
      providerInfo,
    });

    let readModelReady = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/v1/events")) {
        return new Response(
          JSON.stringify({
            defaultEventId: "main-event",
            items: [
              {
                ticketEventId: "main-event",
                name: "Main Event",
                symbol: "CTK",
                primaryPriceWei: parseEther("0.15").toString(),
                maxSupply: "120",
                treasury: "0x00000000000000000000000000000000000000aa",
                admin: "0x00000000000000000000000000000000000000bb",
                ticketNftAddress: config.ticketNftAddress,
                marketplaceAddress: config.marketplaceAddress,
                checkInRegistryAddress: config.checkInRegistryAddress,
                deploymentBlock: 100,
                registeredAt: 0,
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/v1/health")) {
        return new Response(
          JSON.stringify({
            ok: true,
            degraded: !readModelReady,
            checkedAt: Date.now(),
            indexedBlock: readModelReady ? 120 : 90,
            latestBlock: 120,
            lag: readModelReady ? 0 : 30,
            stalenessMs: 1500,
            rpcHealthy: true,
            readModelReady,
            configuredDeploymentBlock: 100,
            alerts: readModelReady
              ? []
              : [
                  {
                    code: "indexer_lag",
                    severity: "warning",
                    message: "Indexer has not caught up past deployment block 100.",
                  },
                ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/v1/system")) {
        return new Response(
          JSON.stringify({
            primaryPriceWei: parseEther("0.15").toString(),
            maxSupply: "120",
            totalMinted: "10",
            maxPerWallet: "2",
            paused: false,
            collectibleMode: false,
          }),
          { status: 200 },
        );
      }

      if (url.includes("/v1/users/")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                tokenId: "7",
                owner: "0x00000000000000000000000000000000000000AA",
                used: false,
                tokenURI: "ipfs://ticket/base/7.json",
                listed: false,
                listingPriceWei: null,
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/v1/listings")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                tokenId: "1",
                seller: "0x00000000000000000000000000000000000000aa",
                priceWei: parseEther("0.08").toString(),
                isActive: true,
              },
            ],
          }),
          { status: 200 },
        );
      }

      if (url.includes("/v1/market/stats")) {
        return new Response(
          JSON.stringify({
            listingCount: 0,
            floorPriceWei: null,
            medianPriceWei: null,
            maxPriceWei: null,
            averagePriceWei: null,
            suggestedListPriceWei: null,
          }),
          { status: 200 },
        );
      }

      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithProvider({
      runtimeConfig: {
        apiBaseUrl: "http://localhost:8787",
        chainEnv: "amoy",
        featureFlags: [],
        defaultEventId: "main-event",
        factoryAddress: null,
        governanceTimelockAddress: null,
        governanceMinDelaySeconds: 0,
        governancePortalUrl: null,
      },
      createClient,
      walletConnector,
    });

    await waitFor(() => {
      expect(screen.getByTestId("bff-mode")).toHaveTextContent("degraded");
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("wallet-address")).toHaveTextContent("0x00000000000000000000000000000000000000AA");
    });
    await waitFor(() => {
      expect(screen.getByTestId("ticket-count")).toHaveTextContent("1");
    });
    expect(getSystemStateMock).toHaveBeenCalled();
    expect(getListingsMock).toHaveBeenCalled();
    expect(getMyTicketsMock).toHaveBeenCalled();
    expect(eventSourceUrls).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/system"),
      expect.anything(),
    );

    readModelReady = true;

    await user.click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() => {
      expect(screen.getByTestId("bff-mode")).toHaveTextContent("online");
    });
    expect(eventSourceUrls).toEqual(["http://localhost:8787/v1/events/stream?eventId=main-event"]);
  });

  it("handles success and error transaction flows with tx/activity updates", async () => {
    const readClient = makeClient();
    const walletClient = makeClient({
      preflightAction: vi.fn().mockResolvedValue({
        action: "mint",
        ok: true,
        blockers: [],
        warnings: [],
        gasEstimate: 99999n,
        simulationPassed: true,
        listingHealth: null,
        walletCapRemaining: 1n,
      }),
    });

    const createClient = vi.fn(
      (_cfg: ContractConfig, options?: { signer?: Signer; readProvider?: Provider }) =>
        options?.signer ? walletClient : readClient,
    );

    const walletConnector = vi.fn().mockResolvedValue({
      signer: {} as Signer,
      provider: {} as BrowserProvider,
      address: "0x00000000000000000000000000000000000000AA",
      chainId: 80002,
      providerInfo,
    });

    renderWithProvider({
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
      createClient,
      walletConnector,
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("wallet-address")).toHaveTextContent("0x00000000000000000000000000000000000000AA");
    });

    await user.click(screen.getByRole("button", { name: "preview-success" }));
    await user.click(screen.getByRole("button", { name: "confirm" }));

    await waitFor(() => {
      expect(screen.getByTestId("tx-status")).toHaveTextContent("success");
    });
    expect(screen.getByTestId("activity-count")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "preview-failure" }));
    await user.click(screen.getByRole("button", { name: "confirm" }));

    await waitFor(() => {
      expect(screen.getByTestId("tx-status")).toHaveTextContent("error");
    });
    expect(screen.getByTestId("activity-count")).toHaveTextContent("2");
    expect(screen.getByTestId("error-message")).toHaveTextContent("forced failure");
  });
});
