import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { useI18n } from "../../i18n/I18nContext";
import { formatAddress, formatEventStart } from "../../lib/format";
import { useAppState } from "../../state/useAppState";
import { EventDemoNotice } from "../events/EventDemoNotice";
import { EventPoster } from "../events/EventPoster";
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
  eyebrow: string;
  description: string;
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
      {
        to: "/app/fan",
        label: t("navBuy"),
        eyebrow: "Primary",
        description: "Mint the first-party pass with preflight checks.",
      },
      {
        to: "/app/market",
        label: t("navResale"),
        eyebrow: "Marketplace",
        description: "Explore capped resale inventory with transparent pricing.",
      },
      {
        to: "/app/tickets",
        label: t("navMyTickets"),
        eyebrow: "Wallet",
        description: "Open the pass, QR entry, and collectible preview.",
      },
      {
        to: "/app/advanced",
        label: t("navAdvanced"),
        eyebrow: "Operations",
        description: "Scanner, organizer controls, and advanced diagnostics.",
      },
    ],
    [t],
  );
  const selectedEvent = useMemo(
    () =>
      availableEvents.find((event) => event.ticketEventId === selectedEventId) ??
      availableEvents[0] ??
      null,
    [availableEvents, selectedEventId],
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
              <span>Investor demo for modern ticketing and collectibles</span>
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
                  <div className="rail-link-copy">
                    <small>{item.eyebrow}</small>
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </div>
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
              <Tag tone="default">{contractConfig.eventName ?? contractConfig.eventId ?? "Event"}</Tag>
              <span className="utility-wallet">
                {walletAddress ? formatAddress(walletAddress, 6) : t("networkNotConnected")}
              </span>
            </div>

            <ButtonGroup compact>
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

          <section className="experience-banner" role="status" aria-live="polite">
            <div className="experience-banner-copy">
              <p className="global-guide-eyebrow">Event spotlight</p>
              <h2>{selectedEvent?.name ?? contractConfig.eventName ?? contractConfig.eventId ?? "ChainTicket event"}</h2>
              <p>
                Ticketing confidence inspired by modern mobile entry flows, with a collectible reveal
                narrative layered on top of the NFT.
              </p>
              <div className="experience-banner-facts">
                <strong>{formatEventStart(selectedEvent?.startsAt)}</strong>
                <span>
                  {[selectedEvent?.venueName, selectedEvent?.city, selectedEvent?.countryCode]
                    .filter(Boolean)
                    .join(" · ") || selectedEvent?.ticketEventId || "ChainTicket live event"}
                </span>
                {selectedEvent?.category ? <span>{selectedEvent.category}</span> : null}
              </div>
            </div>
            <div className="experience-banner-meta">
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
              <Link to="/app/tickets" className="button-link ghost compact-link">
                Open passes
              </Link>
            </div>
            {selectedEvent ? (
              <div className="experience-banner-visual">
                <EventPoster event={selectedEvent} className="experience-poster" />
              </div>
            ) : null}
          </section>

          <EventDemoNotice event={selectedEvent} compact />

          {availableEvents.length > 1 ? (
            <section className="event-switcher" aria-label="Available events">
              {availableEvents.map((event) => (
                <button
                  key={event.ticketEventId}
                  type="button"
                  className={
                    event.ticketEventId === selectedEventId
                      ? "event-switch-card active"
                      : "event-switch-card"
                  }
                  onClick={() => setSelectedEventId(event.ticketEventId)}
                >
                  <EventPoster event={event} className="event-switch-poster" />
                  <div className="event-switch-copy">
                    <span>{event.symbol}</span>
                    <strong>{event.name}</strong>
                    <small>{formatEventStart(event.startsAt)}</small>
                    <small>
                      {[event.city, event.countryCode].filter(Boolean).join(", ") || event.ticketEventId}
                    </small>
                    <em>{event.category ?? event.ticketEventId}</em>
                  </div>
                </button>
              ))}
            </section>
          ) : null}

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
                {item.eyebrow.slice(0, 1)}
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
