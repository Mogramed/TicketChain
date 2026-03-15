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
    ...overrides,
  };
}

describe("TicketsPage", () => {
  it("shows an indexed-read warning instead of an empty inventory when the BFF is not ready", () => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());

    render(
      <I18nProvider>
        <MemoryRouter>
          <TicketsPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(screen.getByText("Ticket inventory unavailable")).toBeInTheDocument();
    expect(
      screen.getByText(/owned ticket inventory and timeline entry points stay blocked/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("You do not own any tickets yet.")).not.toBeInTheDocument();
  });
});
