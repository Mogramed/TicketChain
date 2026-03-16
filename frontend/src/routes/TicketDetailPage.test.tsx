import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { TicketDetailPage } from "./TicketDetailPage";

const useAppStateMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    fetchTicketTimeline: vi.fn().mockResolvedValue([
      {
        id: "timeline-1",
        tokenId: 7n,
        kind: "collectible",
        blockNumber: 120,
        txHash: "0xabc",
        timestamp: 1_700_000_000,
        description: "Collectible mode enabled",
      },
    ]),
    contractConfig: {
      eventId: "main-event",
      eventName: "Paris Finals",
      explorerTxBaseUrl: "https://amoy.polygonscan.com/tx/",
    },
    indexedReadsAvailable: true,
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
      primaryPrice: 100000000000000000n,
      maxSupply: 100n,
      totalMinted: 10n,
      maxPerWallet: 2n,
      paused: false,
      collectibleMode: false,
      baseTokenURI: "ipfs://ticket/base/",
      collectibleBaseURI: "ipfs://ticket/collectible/",
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
        source: "ticketmaster",
        sourceUrl: "https://ticketmaster.example/paris-finals",
      },
    ],
    selectedEventId: "main-event",
    watchlist: new Set<string>(),
    toggleWatch: vi.fn(),
    ...overrides,
  };
}

describe("TicketDetailPage", () => {
  it("renders the pass hero, collectible toggle, and QR panel", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter initialEntries={["/app/tickets/7"]}>
            <Routes>
              <Route path="/app/tickets/:tokenId" element={<TicketDetailPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: /Paris Finals/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/Demo pass only - not official venue admission/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Live pass" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Mobile entry QR/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Collectible" }));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Collectible" })).toHaveAttribute("aria-selected", "true");
    });

    expect(screen.getByText(/Lifecycle proof/i)).toBeInTheDocument();
  });
});
