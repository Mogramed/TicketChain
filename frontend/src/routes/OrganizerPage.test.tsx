import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { OrganizerPage } from "./OrganizerPage";

const useAppStateMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    contractConfig: {
      eventId: "main-event",
      eventName: "Main Event",
      ticketNftAddress: "0x0000000000000000000000000000000000000011",
      marketplaceAddress: "0x0000000000000000000000000000000000000022",
      checkInRegistryAddress: "0x0000000000000000000000000000000000000033",
    },
    runtimeConfig: {
      apiBaseUrl: "http://localhost:8787",
      chainEnv: "amoy",
      featureFlags: [],
      defaultEventId: "main-event",
      factoryAddress: null,
      governanceTimelockAddress: "0x00000000000000000000000000000000000000DD",
      governanceMinDelaySeconds: 86400,
      governancePortalUrl: "https://safe.example/governance",
    },
    bffSupportsSelectedEvent: true,
    indexedReadsAvailable: true,
    indexedReadsIssue: null,
    bffMode: "online",
    walletAddress: "0x00000000000000000000000000000000000000AA",
    userRoles: {
      isAdmin: false,
      isScannerAdmin: true,
      isPauser: true,
      isScanner: false,
    },
    systemState: {
      primaryPrice: 100000000000000000n,
      maxSupply: 100n,
      totalMinted: 12n,
      maxPerWallet: 2n,
      paused: false,
      collectibleMode: false,
    },
    marketStats: {
      listingCount: 4,
      floorPrice: 80000000000000000n,
      medianPrice: 90000000000000000n,
      maxPrice: 100000000000000000n,
      averagePrice: 90000000000000000n,
      suggestedListPrice: 90000000000000000n,
    },
    preparePreview: vi.fn(),
    setErrorMessage: vi.fn(),
    setStatusMessage: vi.fn(),
    refreshDashboard: vi.fn(),
    uiMode: "advanced",
    ...overrides,
  };
}

function renderPage() {
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
      <I18nProvider>
        <MemoryRouter>
          <OrganizerPage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrganizerPage", () => {
  beforeEach(() => {
    window.localStorage.setItem("chainticket.language", "en");
    useAppStateMock.mockReturnValue(makeAppState());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ticketEventId: "main-event",
            roles: [
              {
                ticketEventId: "main-event",
                contractScope: "ticket",
                roleId: `0x${"0".repeat(64)}`,
                account: "0x00000000000000000000000000000000000000aa",
                grantedBy: "0x00000000000000000000000000000000000000bb",
                isActive: true,
                updatedBlock: 42,
                updatedTxHash: "0xgrant",
              },
              {
                ticketEventId: "main-event",
                contractScope: "checkin_registry",
                roleId:
                  "0xf49c8f6dbaf12f396d513a6fd13476e78bc134d1944e54ebf79ec7f1d7f1abce",
                account: "0x00000000000000000000000000000000000000cc",
                grantedBy: "0x00000000000000000000000000000000000000bb",
                isActive: true,
                updatedBlock: 45,
                updatedTxHash: "0xscanner",
              },
            ],
            recentActivity: [
              {
                id: "activity-1",
                ticketEventId: "main-event",
                contractScope: "ticket",
                type: "paused",
                roleId: null,
                account: null,
                actor: "0x00000000000000000000000000000000000000bb",
                blockNumber: 50,
                txHash: "0xpause",
                timestamp: 1700000000,
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
  });

  it("keeps governance actions read-only for ops-only wallets", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Operational controls" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pause System$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Grant scanner/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Enable Collectible/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Prepare enable packet/i })).toBeEnabled();
    expect(screen.getByText(/No direct governance wallet is connected/i)).toBeInTheDocument();
    expect(screen.getByText(/Use timelock or multisig governance flow/i)).toBeInTheDocument();
  });

  it("enables governance controls when a governance wallet is connected", () => {
    useAppStateMock.mockReturnValue(
      makeAppState({
        userRoles: {
          isAdmin: true,
          isScannerAdmin: true,
          isPauser: true,
          isScanner: false,
        },
      }),
    );

    renderPage();

    expect(screen.getByRole("button", { name: /Enable Collectible/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Prepare enable packet/i })).toBeEnabled();
    expect(screen.getByText(/Direct governance wallet available in this session/i)).toBeInTheDocument();
  });

  it("prepares and copies a timelock governance packet", async () => {
    renderPage();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Prepare enable packet/i }));

    expect(screen.getByText(/TimelockController schedule \+ execute/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Schedule in TimelockController/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Copy schedule calldata/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open governance portal/i })).toHaveAttribute(
      "href",
      "https://safe.example/governance",
    );
    expect(
      (screen.getByLabelText(/Governance packet JSON/i) as HTMLTextAreaElement).value,
    ).toContain('"mode": "timelock"');
  });

  it("shows indexed operator roster and recent activity for the selected event", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/synced at block 42/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/System paused by/i)).toBeInTheDocument();
    expect(screen.getByText("Main Event")).toBeInTheDocument();
  });
});
