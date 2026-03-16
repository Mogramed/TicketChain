import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { ExplorePage } from "./ExplorePage";

const useAppStateMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    availableEvents: [
      {
        ticketEventId: "paris-finals",
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
        registeredAt: 1_700_000_000,
        city: "Paris",
        countryCode: "FR",
        venueName: "Accor Arena",
        category: "Pop",
      },
      {
        ticketEventId: "berlin-night",
        name: "Berlin Night",
        symbol: "BN26",
        primaryPriceWei: "90000000000000000",
        maxSupply: "100",
        treasury: "0x0000000000000000000000000000000000000001",
        admin: "0x0000000000000000000000000000000000000002",
        ticketNftAddress: "0x0000000000000000000000000000000000000003",
        marketplaceAddress: "0x0000000000000000000000000000000000000004",
        checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
        deploymentBlock: 120,
        registeredAt: 1_700_000_100,
        city: "Berlin",
        countryCode: "DE",
        venueName: "Velodrom",
        category: "Electronic",
      },
    ],
    selectedEventId: "paris-finals",
    setSelectedEventId: vi.fn(),
    ...overrides,
  };
}

describe("ExplorePage", () => {
  it("renders the editorial hero and filters the lineup by city", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <ExplorePage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /Explore live experiences/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Paris Finals/i })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("City"), "Paris");

    expect(screen.queryByRole("heading", { name: /Berlin Night/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /View event/i }).length).toBeGreaterThan(0);
  });
});
