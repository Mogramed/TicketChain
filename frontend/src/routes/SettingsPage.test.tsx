import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { SettingsPage } from "./SettingsPage";

const useAppStateMock = vi.fn();
vi.mock("../state/useAppState", () => ({
  useAppState: () => useAppStateMock(),
}));

function makeAppState(overrides: Record<string, unknown> = {}) {
  return {
    runtimeConfig: {
      apiBaseUrl: "http://localhost:8787",
      chainEnv: "amoy",
      featureFlags: ["demo"],
      defaultEventId: "main-event",
      factoryAddress: null,
      governanceTimelockAddress: "0x00000000000000000000000000000000000000DD",
      governanceMinDelaySeconds: 86400,
      governancePortalUrl: "https://safe.example/governance",
    },
    venueSafeMode: false,
    setVenueSafeMode: vi.fn(),
    userRoles: {
      isAdmin: true,
      isScannerAdmin: true,
      isPauser: false,
      isScanner: false,
    },
    bffMode: "online",
    uiMode: "guide",
    setUiMode: vi.fn(),
    setOnboardingSeen: vi.fn(),
    ...overrides,
  };
}

describe("SettingsPage", () => {
  it("keeps settings inside the organizer workspace and toggles venue-safe mode", async () => {
    window.localStorage.setItem("chainticket.language", "en");
    const state = makeAppState();
    useAppStateMock.mockReturnValue(state);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <MemoryRouter>
            <SettingsPage />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: /Organizer settings/i })).toBeInTheDocument();
    expect(screen.getByText(/Language and display/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Disabled/i }));
    expect(state.setVenueSafeMode).toHaveBeenCalledWith(true);
  });
});
