import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../i18n/I18nContext";
import { extractTokenId } from "../lib/scannerToken";
import { ScannerPage } from "./ScannerPage";

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
    userRoles: {
      isAdmin: false,
      isScannerAdmin: false,
      isPauser: false,
      isScanner: true,
    },
    preparePreview: vi.fn(),
    setErrorMessage: vi.fn(),
    txState: {
      status: "idle",
      timestamp: Date.now(),
    },
    uiMode: "advanced",
    ...overrides,
  };
}

describe("ScannerPage", () => {
  beforeEach(() => {
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
  });

  it("keeps the manual check-in flow working when camera scanning is unavailable", async () => {
    const appState = makeAppState();
    useAppStateMock.mockReturnValue(appState);

    render(
      <I18nProvider>
        <MemoryRouter>
          <ScannerPage />
        </MemoryRouter>
      </I18nProvider>,
    );

    expect(screen.getByText(/Manual mode \(Manual entry\)/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Token ID/i), "123");
    await user.click(screen.getAllByRole("button", { name: /^Mark Ticket Used$/i })[0]!);

    expect(appState.preparePreview).toHaveBeenCalledTimes(1);
    expect(appState.preparePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Scanner check-in",
        description: expect.stringMatching(/irreversible/i),
      }),
    );
  });

  it("extracts token ids from ticket deep links generated for mobile entry", () => {
    expect(extractTokenId("https://demo.chainticket.app/app/tickets/77?eventId=main-event")).toBe("77");
    expect(extractTokenId("https://demo.chainticket.app/app/tickets/77?eventId=main-event&view=collectible")).toBe("77");
  });
});
