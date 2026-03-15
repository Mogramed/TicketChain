import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { useI18n } from "../../i18n/I18nContext";
import { formatAddress } from "../../lib/format";
import { useAppState } from "../../state/useAppState";
import {
  Badge,
  ButtonGroup,
  Panel,
  RiskBanner,
  Toast,
  Tag,
} from "../ui/Primitives";
import { GlobalGuideBar } from "./GlobalGuideBar";
import { OnboardingGuide } from "./OnboardingGuide";
import { TransactionPreviewDrawer } from "./TransactionPreviewDrawer";

interface NavigationItem {
  to: string;
  label: string;
  glyph: string;
}

function useIsMobileBreakpoint(maxWidth: number): boolean {
  const mediaQuery = `(max-width: ${maxWidth}px)`;
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    if (typeof window.matchMedia !== "function") {
      return window.innerWidth <= maxWidth;
    }
    return window.matchMedia(mediaQuery).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (typeof window.matchMedia !== "function") {
      const onResize = () => {
        setIsMobile(window.innerWidth <= maxWidth);
      };

      window.addEventListener("resize", onResize);
      return () => {
        window.removeEventListener("resize", onResize);
      };
    }

    const media = window.matchMedia(mediaQuery);
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onChange);
    } else {
      media.addListener(onChange);
    }
    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", onChange);
      } else {
        media.removeListener(onChange);
      }
    };
  }, [maxWidth, mediaQuery]);

  return isMobile;
}

export function AppLayout() {
  const { t } = useI18n();
  const {
    walletProviders,
    selectedProviderId,
    setSelectedProviderId,
    connectWallet,
    disconnectWallet,
    refreshDashboard,
    walletAddress,
    walletChainId,
    contractConfig,
    runtimeConfig,
    availableEvents,
    selectedEventId,
    setSelectedEventId,
    isConnecting,
    isRefreshing,
    statusMessage,
    errorMessage,
    bffMode,
    indexedReadsIssue,
    hasValidConfig,
    configIssues,
    systemState,
    walletCapRemaining,
    venueSafeMode,
    uiMode,
  } = useAppState();

  const isMobile = useIsMobileBreakpoint(940);

  const navigation = useMemo<NavigationItem[]>(
    () => [
      { to: "/app/fan", label: t("navBuy"), glyph: "A" },
      { to: "/app/market", label: t("navResale"), glyph: "R" },
      { to: "/app/tickets", label: t("navMyTickets"), glyph: "T" },
      { to: "/app/advanced", label: t("navAdvanced"), glyph: "X" },
    ],
    [t],
  );

  const walletStatusTone = walletChainId === contractConfig.chainId ? "success" : "warning";

  return (
    <div className={venueSafeMode ? "arena-page venue-safe" : "arena-page"}>
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>
      <div className="arena-glow arena-glow-a" aria-hidden="true" />
      <div className="arena-glow arena-glow-b" aria-hidden="true" />
      <div className="arena-grid-pattern" aria-hidden="true" />

      <div className="arena-shell">
        {!isMobile ? (
          <aside className="arena-rail" aria-label="Primary navigation">
            <div className="arena-brand">
              <p>{t("appEyebrow")}</p>
              <h1>ChainTicket</h1>
              <span>Live Arena Edition</span>
            </div>

            <nav className="arena-rail-nav">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "rail-link active" : "rail-link"
                  }
                >
                  <span className="rail-glyph" aria-hidden="true">
                    {item.glyph}
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            <Panel className="rail-meta">
              <p className="rail-meta-title">{t("network")}</p>
              <Badge tone={walletStatusTone}>
                {walletChainId === contractConfig.chainId
                  ? contractConfig.chainName
                  : t("networkNotConnected")}
              </Badge>
              <p className="rail-meta-caption">{t("rulesText")}</p>
            </Panel>
          </aside>
        ) : null}

        <main className="arena-main" id="main-content">
          <header className="utility-bar">
            <div className="utility-left">
              <Badge tone={walletStatusTone}>
                {walletChainId === contractConfig.chainId
                  ? t("networkSecure", { chainName: contractConfig.chainName })
                  : t("networkNotConnected")}
              </Badge>
              <span className="utility-wallet">
                {walletAddress ? formatAddress(walletAddress, 6) : t("networkNotConnected")}
              </span>
            </div>

            <ButtonGroup compact>
              {availableEvents.length > 1 ? (
                <select
                  className="wallet-select"
                  value={selectedEventId}
                  onChange={(event) => setSelectedEventId(event.target.value)}
                  aria-label="Ticket event"
                >
                  {availableEvents.map((event) => (
                    <option key={event.ticketEventId} value={event.ticketEventId}>
                      {event.name}
                    </option>
                  ))}
                </select>
              ) : null}
              <select
                className="wallet-select"
                value={selectedProviderId}
                onChange={(event) => setSelectedProviderId(event.target.value)}
                aria-label="Wallet provider"
              >
                {walletProviders.length === 0 ? (
                  <option value="">{t("noWalletFound")}</option>
                ) : null}
                {walletProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={walletAddress ? "ghost" : "primary"}
                onClick={() => void connectWallet()}
                disabled={isConnecting || !hasValidConfig || walletProviders.length === 0}
              >
                {isConnecting
                  ? t("connecting")
                  : walletAddress
                    ? t("reconnectWallet")
                    : t("connectWallet")}
              </button>
              {walletAddress ? (
                <button type="button" className="ghost" onClick={disconnectWallet}>
                  {t("disconnectWallet")}
                </button>
              ) : null}
              <button
                type="button"
                className="ghost"
                onClick={() => void refreshDashboard()}
              >
                {isRefreshing ? t("refreshing") : t("refresh")}
              </button>
            </ButtonGroup>
          </header>

          <section className="critical-strip" role="status" aria-live="polite">
            <Tag tone="default">Event: {contractConfig.eventName ?? contractConfig.eventId ?? "-"}</Tag>
            <Tag tone={systemState?.paused ? "danger" : "success"}>
              {t("systemPause")}: {systemState?.paused ? t("enabled") : t("disabled")}
            </Tag>
            <Tag tone={systemState?.collectibleMode ? "info" : "default"}>
              {t("collectibleMode")}: {systemState?.collectibleMode ? t("enabled") : t("disabled")}
            </Tag>
            <Tag tone="info">
              {t("walletCapRemaining")}:{" "}
              {walletCapRemaining !== null ? walletCapRemaining.toString() : "-"}
            </Tag>
            <Tag tone="default">Mode: {uiMode === "guide" ? t("uiModeGuide") : t("uiModeAdvanced")}</Tag>
          </section>

          <GlobalGuideBar />

          {statusMessage || errorMessage ? (
            <section className="status-stack" aria-live="polite">
              {statusMessage ? (
                <Toast tone="success" title={t("toastSuccessTitle")} message={statusMessage} />
              ) : null}
              {errorMessage ? (
                <Toast tone="danger" title={t("toastErrorTitle")} message={errorMessage} />
              ) : null}
            </section>
          ) : null}

          {!hasValidConfig ? (
            <RiskBanner
              tone="error"
              title="Frontend configuration blocked"
              cause={configIssues.join(" | ")}
              impact="Wallet and on-chain reads are unavailable until environment variables are corrected."
              action="Update frontend/.env using VITE_* keys only, then restart the app."
            />
          ) : null}

          {hasValidConfig && runtimeConfig.apiBaseUrl && indexedReadsIssue ? (
            <RiskBanner
              tone={bffMode === "offline" ? "error" : "warning"}
              title="Backend indexed reads unavailable"
              cause={indexedReadsIssue}
              impact="Market listings, owned tickets, timelines, and live indexed views stay unavailable until the BFF is ready."
              action="Keep the BFF running, confirm DEPLOYMENT_BLOCK matches the deployed contracts, and wait for the indexer to catch up."
            />
          ) : null}

          <section className="workspace-shell">
            <Outlet />
          </section>
        </main>
      </div>

      {isMobile ? (
        <nav className="bottom-nav" aria-label="Primary mobile navigation">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "bottom-link active" : "bottom-link")}
            >
              <span className="bottom-glyph" aria-hidden="true">
                {item.glyph}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      ) : null}

      <OnboardingGuide />
      <TransactionPreviewDrawer />
    </div>
  );
}
