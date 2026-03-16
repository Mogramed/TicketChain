import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { parseEther, type Signer } from "ethers";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "./i18n/I18nContext";
import { AppRouter } from "./router/AppRouter";
import { AppStateProvider } from "./state/AppStateContext";
import type {
  ChainTicketClient,
  ContractConfig,
  RuntimeConfig,
  WalletProviderInfo,
} from "./types/chainticket";

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

const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: null,
  chainEnv: "amoy",
  featureFlags: [],
  defaultEventId: "main-event",
  factoryAddress: null,
  governanceTimelockAddress: null,
  governanceMinDelaySeconds: 0,
  governancePortalUrl: null,
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

function tx(hash: string) {
  return {
    hash,
    wait: vi.fn().mockResolvedValue(undefined),
  };
}

function buildReadClient(ticketsUsed = true): ChainTicketClient {
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
    getMyTickets: vi.fn().mockResolvedValue([
      {
        tokenId: 1n,
        owner: "0x00000000000000000000000000000000000000AA",
        used: ticketsUsed,
        tokenURI: "ipfs://ticket/1.json",
        listed: false,
        listingPrice: null,
      },
    ]),
    getListings: vi.fn().mockResolvedValue([
      {
        tokenId: 9n,
        seller: "0x00000000000000000000000000000000000000CC",
        price: parseEther("0.09"),
        isActive: true,
      },
    ]),
    getMarketStats: vi.fn().mockResolvedValue({
      listingCount: 1,
      floorPrice: parseEther("0.09"),
      medianPrice: parseEther("0.09"),
      maxPrice: parseEther("0.09"),
      averagePrice: parseEther("0.09"),
      suggestedListPrice: parseEther("0.09"),
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
      isAdmin: true,
      isScannerAdmin: true,
      isPauser: true,
      isScanner: true,
    }),
    markTicketUsed: vi.fn().mockResolvedValue(tx("0xused")),
    grantScannerRole: vi.fn().mockResolvedValue(tx("0xgrant-scanner")),
    revokeScannerRole: vi.fn().mockResolvedValue(tx("0xrevoke-scanner")),
    pauseSystem: vi.fn().mockResolvedValue(tx("0xpause")),
    unpauseSystem: vi.fn().mockResolvedValue(tx("0xunpause")),
    setCollectibleMode: vi.fn().mockResolvedValue(tx("0xcollectible")),
  };
}

describe("App route-based smoke", () => {
  it("covers connect, list flow, and ticket status rendering", async () => {
    const readClient = buildReadClient(true);
    const walletClient = buildReadClient(true);
    const signer = {} as Signer;

    const createClient = vi.fn((_cfg: ContractConfig, options?: { signer?: Signer }) => {
      return options?.signer ? walletClient : readClient;
    });

    const walletConnector = vi.fn().mockResolvedValue({
      signer,
      address: "0x00000000000000000000000000000000000000AA",
      chainId: 80002,
      providerInfo,
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <AppStateProvider
            contractConfig={config}
            runtimeConfig={runtimeConfig}
            createClient={createClient}
            walletConnector={walletConnector}
          >
            <MemoryRouter initialEntries={["/app/fan"]}>
              <AppRouter />
            </MemoryRouter>
          </AppStateProvider>
        </I18nProvider>
      </QueryClientProvider>,
    );

    const user = userEvent.setup();
    await screen.findByTestId("explore-page", {}, { timeout: 5_000 });

    const connectButtons = await screen.findAllByRole("button", {
      name: /Connect Wallet|Connecter le wallet|Connect wallet/i,
    });
    const enabledConnectButton = connectButtons.find((button) => !button.hasAttribute("disabled"));
    expect(enabledConnectButton).toBeDefined();
    await user.click(enabledConnectButton!);

    await waitFor(() => {
      expect(walletConnector).toHaveBeenCalledTimes(1);
    });

    const marketLinks = screen.getAllByRole("link", {
      name: /Marketplace|Marche|Resale|Revente/i,
    });
    await user.click(marketLinks[0]!);
    await screen.findByTestId("market-page");

    await user.clear(screen.getByLabelText(/Token ID/i));
    await user.type(screen.getByLabelText(/Token ID/i), "1");
    await user.clear(screen.getByLabelText(/Listing Price \(POL\)/i));
    await user.type(screen.getByLabelText(/Listing Price \(POL\)/i), "0.05");

    await user.click(screen.getByRole("button", { name: /One-step listing/i }));
    await user.click(screen.getByRole("button", { name: /Confirm & Sign|Confirmer & signer/i }));

    await waitFor(() => {
      expect(walletClient.listTicketWithPermit).toHaveBeenCalledWith(1n, parseEther("0.05"));
    });

    const ticketLinks = screen.getAllByRole("link", {
      name: /Tickets|My Tickets|Ticket Vault/i,
    });
    await user.click(ticketLinks[0]!);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Ticket Vault/i })).toBeInTheDocument();
      expect(screen.getAllByText(/^Used$/i, { selector: "span" }).length).toBeGreaterThan(0);
    });
  }, 15_000);
});
