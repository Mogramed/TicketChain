import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseEther, type Signer } from "ethers";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppStateProvider, useAppState } from "./AppStateContext";
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
  deploymentBlock: 0,
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
  createClient: (cfg: ContractConfig, options?: { signer?: Signer }) => ChainTicketClient;
  walletConnector?: (
    cfg: ContractConfig,
    provider?: WalletProviderInfo,
  ) => Promise<{ signer: Signer; address: string; chainId: number; providerInfo: WalletProviderInfo }>;
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

    const createClient = vi.fn((_cfg: ContractConfig, options?: { signer?: Signer }) =>
      options?.signer ? walletClient : readClient,
    );

    const walletConnector = vi.fn().mockResolvedValue({
      signer: {} as Signer,
      address: "0x00000000000000000000000000000000000000AA",
      chainId: 80002,
      providerInfo,
    });

    renderWithProvider({
      runtimeConfig: { apiBaseUrl: null, chainEnv: "amoy", featureFlags: [] },
      createClient,
      walletConnector,
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "connect" }));

    await waitFor(() => {
      expect(screen.getByTestId("wallet-address")).toHaveTextContent("0x00000000000000000000000000000000000000AA");
    });

    await user.click(screen.getByRole("button", { name: "disconnect" }));

    expect(screen.getByTestId("wallet-address")).toHaveTextContent("none");
    expect(screen.getByTestId("status-message")).toHaveTextContent("Wallet disconnected.");
  });

  it("falls back from BFF to RPC and recovers bffMode to online", async () => {
    class FakeEventSource {
      addEventListener() {}
      removeEventListener() {}
      close() {}
    }

    vi.stubGlobal("EventSource", FakeEventSource);

    const readClient = makeClient({
      getSystemState: vi.fn().mockResolvedValue({
        primaryPrice: parseEther("0.15"),
        maxSupply: 120n,
        totalMinted: 10n,
        maxPerWallet: 2n,
        paused: false,
        collectibleMode: false,
      }),
    });

    const createClient = vi.fn(() => readClient);

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"));

    vi.stubGlobal("fetch", fetchMock);

    renderWithProvider({
      runtimeConfig: { apiBaseUrl: "http://localhost:8787", chainEnv: "amoy", featureFlags: [] },
      createClient,
    });

    await waitFor(() => {
      expect(screen.getByTestId("bff-mode")).toHaveTextContent("offline");
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
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

      if (url.includes("/v1/listings")) {
        return new Response(JSON.stringify({ items: [] }), { status: 200 });
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

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "refresh" }));

    await waitFor(() => {
      expect(screen.getByTestId("bff-mode")).toHaveTextContent("online");
    });
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

    const createClient = vi.fn((_cfg: ContractConfig, options?: { signer?: Signer }) =>
      options?.signer ? walletClient : readClient,
    );

    const walletConnector = vi.fn().mockResolvedValue({
      signer: {} as Signer,
      address: "0x00000000000000000000000000000000000000AA",
      chainId: 80002,
      providerInfo,
    });

    renderWithProvider({
      runtimeConfig: { apiBaseUrl: null, chainEnv: "amoy", featureFlags: [] },
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
