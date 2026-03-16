import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { TicketsPage } from "./TicketsPage";

const useAppStateMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    tickets: [],
    walletAddress: "0x00000000000000000000000000000000000000AA",
    watchlist: new Set<string>(),
    toggleWatch: vi.fn(),
    refreshDashboard: vi.fn(),
    uiMode: "advanced",
    connectWallet: vi.fn(),
    indexedReadsAvailable: false,
    indexedReadsIssue: "Indexer has not caught up past deployment block 100.",
    runtimeConfig: {
      apiBaseUrl: "http://localhost:8787",
    },
    contractConfig: {
      eventId: "main-event",
    },
    selectedEventName: "Paris Finals",
    availableEvents: [
      {
        ticketEventId: "main-event",
        name: "Paris Finals",
        symbol: "PF26",
        primaryPriceWei: "100000000000000000",
        maxSupply: "100",
        treasury: "0x0000000000000000000000000000000000000001",
        admin: "0x0000000000000000000000000000000000000002",
        ticketNftAddress: "0x0000000000000000000000000000000000000003",
        marketplaceAddress: "0x0000000000000000000000000000000000000004",
        checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
        deploymentBlock: 100,
        registeredAt: 1700000000,
        isDemoInspired: true,
        demoDisclaimer: "Demo pass only - not official venue admission",
      },
    ],
    selectedEventId: "main-event",
    ...overrides,
  };
}

describe("TicketsPage", () => {
  it("shows a fallback-read warning instead of an empty inventory message when the BFF is not ready", () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Indexed enrichments delayed")).toBeInTheDocument();
    expect(
      screen.getByText(/your passes stay visible from direct on-chain reads/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("You do not own any tickets yet.")).not.toBeInTheDocument();
  });

  it("keeps rendering owned passes while indexed reads are degraded", () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(
      makeAppState({
        tickets: [
          {
            tokenId: 7n,
            owner: "0x00000000000000000000000000000000000000AA",
            used: false,
            tokenURI: "ipfs://ticket/base/7.json",
            listed: false,
            listingPrice: null,
          },
        ],
        systemState: {
          collectibleMode: false,
          baseTokenURI: "ipfs://ticket/base/",
          collectibleBaseURI: "ipfs://ticket/collectible/",
        },
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <TicketsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Your passes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open pass" })).toBeInTheDocument();
    expect(screen.getAllByText(/token #7/i).length).toBeGreaterThan(0);
  });
});
