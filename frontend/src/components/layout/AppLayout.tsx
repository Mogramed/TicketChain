import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useI18n } from "../../i18n/I18nContext";
import { formatAddress, formatEventStart } from "../../lib/format";
import { getWorkspacePresentation } from "../../lib/workspaceContent";
import {
  ORGANIZER_SUBROUTE_PATHS,
  resolveOrganizerSubroute,
  resolveWorkspace,
  WORKSPACE_CONFIGS,
} from "../../lib/workspaceRouting";
import { useAppState } from "../../state/useAppState";
import { EventPoster } from "../events/EventPoster";
import { Badge, ButtonGroup, RiskBanner, Tag, Toast } from "../ui/Primitives";
import { OnboardingGuide } from "./OnboardingGuide";
import { TransactionPreviewDrawer } from "./TransactionPreviewDrawer";

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

function selectedEventLocation(event: {
  venueName?: string | null;
  city?: string | null;
  countryCode?: string | null;
} | null): string {
  if (!event) {
    return "";
  }
  return [event.venueName, event.city, event.countryCode].filter(Boolean).join(" | ");
}

export function AppLayout() {
  const { locale, t } = useI18n();
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
    userRoles,
  } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobileBreakpoint(940);

  const workspace = resolveWorkspace(location.pathname);
  const organizerSubroute = resolveOrganizerSubroute(location.pathname);
  const workspacePresentationMap = getWorkspacePresentation(locale);
  const workspacePresentation = workspacePresentationMap[workspace];
  const topbarCopy =
    locale === "fr"
      ? {
          brandTagline: "Billetterie de confiance",
          selectedEvent: "Evenement en focus",
          dedicatedOps: "Surface ops dediee",
          viewEvent: "Voir l'evenement",
          noOpsRole: "Aucun role ops",
          availableEvents: "Evenements disponibles",
          walletProvider: "Provider wallet",
        }
      : {
          brandTagline: "Trusted ticketing",
          selectedEvent: "Selected event",
          dedicatedOps: "Dedicated ops surface",
          viewEvent: "View event",
          noOpsRole: "No ops role",
          availableEvents: "Available events",
          walletProvider: "Wallet provider",
        };
  const currentEvent =
    availableEvents.find((event) => event.ticketEventId === selectedEventId) ??
    availableEvents[0] ??
    null;
  const walletStatusTone = walletChainId === contractConfig.chainId ? "success" : "warning";
  const mainNavigation = useMemo(
    () =>
      [
        {
          key: "explore",
          to: WORKSPACE_CONFIGS.explore.path,
          label: getWorkspacePresentation(locale).explore.label,
        },
        {
          key: "marketplace",
          to: WORKSPACE_CONFIGS.marketplace.path,
          label: getWorkspacePresentation(locale).marketplace.label,
        },
        {
          key: "tickets",
          to: WORKSPACE_CONFIGS.tickets.path,
          label: getWorkspacePresentation(locale).tickets.label,
        },
        {
          key: "organizer",
          to: WORKSPACE_CONFIGS.organizer.path,
          label: getWorkspacePresentation(locale).organizer.label,
        },
      ] as const,
    [locale],
  );
  const organizerNavigation = useMemo(
    () =>
      [
        {
          key: "overview",
          to: ORGANIZER_SUBROUTE_PATHS.overview,
          label: locale === "fr" ? "Cockpit" : "Cockpit",
        },
        {
          key: "scanner",
          to: ORGANIZER_SUBROUTE_PATHS.scanner,
          label: locale === "fr" ? "Scanner Mode" : "Scanner Mode",
        },
        {
          key: "sales",
          to: ORGANIZER_SUBROUTE_PATHS.sales,
          label: locale === "fr" ? "Ventes & revente" : "Sales & Resale",
        },
        {
          key: "settings",
          to: ORGANIZER_SUBROUTE_PATHS.settings,
          label: locale === "fr" ? "Parametres" : "Settings",
        },
      ] as const,
    [locale],
  );
  const roleTags = useMemo(() => {
    const tags: string[] = [];
    if (userRoles.isAdmin) {
      tags.push(locale === "fr" ? "Admin gouvernance" : "Governance admin");
    }
    if (userRoles.isScannerAdmin) {
      tags.push(locale === "fr" ? "Admin scanner" : "Scanner admin");
    }
    if (userRoles.isPauser) {
      tags.push(locale === "fr" ? "Role pause" : "Pauser");
    }
    if (userRoles.isScanner) {
      tags.push(locale === "fr" ? "Scanner terrain" : "Scanner");
    }
    return tags;
  }, [locale, userRoles.isAdmin, userRoles.isPauser, userRoles.isScanner, userRoles.isScannerAdmin]);

  const handleEventSwitch = (eventId: string) => {
    setSelectedEventId(eventId);
    if (workspace === "explore") {
      void navigate(`/app/explore/${eventId}`);
    }
  };

  return (
    <div
      className={[
        "workspace-page",
        `workspace-${workspace}`,
        `workspace-accent-${WORKSPACE_CONFIGS[workspace].accent}`,
        venueSafeMode ? "venue-safe" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>
      <div className="workspace-glow workspace-glow-a" aria-hidden="true" />
      <div className="workspace-glow workspace-glow-b" aria-hidden="true" />
      <div className="workspace-grid-pattern" aria-hidden="true" />

      <div className="workspace-shell">
        <header className="workspace-topbar">
          <div className="workspace-topbar-primary">
            <div className="workspace-brand-lockup">
              <Link to={WORKSPACE_CONFIGS.explore.path} className="workspace-brand-mark">
                <span>CT</span>
              </Link>
              <div className="workspace-brand-copy">
                <p>ChainTicket</p>
                <strong>{topbarCopy.brandTagline}</strong>
              </div>
            </div>

            <nav className="workspace-main-nav" aria-label="Primary navigation">
              {mainNavigation.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "workspace-main-link active" : "workspace-main-link"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="workspace-utility-cluster">
            <div className="workspace-network-chip">
              <Badge tone={walletStatusTone}>
                {walletChainId === contractConfig.chainId
                  ? t("networkSecure", { chainName: contractConfig.chainName })
                  : t("networkNotConnected")}
              </Badge>
              <span className="workspace-wallet-text">
                {walletAddress ? formatAddress(walletAddress, 6) : t("networkNotConnected")}
              </span>
            </div>

            <ButtonGroup compact>
              <select
                className="wallet-select workspace-provider-select"
                value={selectedProviderId}
                onChange={(event) => setSelectedProviderId(event.target.value)}
                aria-label={topbarCopy.walletProvider}
              >
                {walletProviders.length === 0 ? <option value="">{t("noWalletFound")}</option> : null}
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
              <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
                {isRefreshing ? t("refreshing") : t("refresh")}
              </button>
            </ButtonGroup>
          </div>
        </header>

        <section
          className={[
            "workspace-hero",
            workspace === "explore" ? undefined : "workspace-hero-compact",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="workspace-hero-copy">
            <p className="workspace-hero-eyebrow">{workspacePresentation.eyebrow}</p>
            <h1>{workspacePresentation.label}</h1>
            <p>{workspacePresentation.summary}</p>
            <div className="workspace-hero-meta">
              <Tag tone={systemState?.paused ? "danger" : "success"}>
                {locale === "fr" ? "System" : "System"}:{" "}
                {systemState?.paused ? t("paused") : t("active")}
              </Tag>
              <Tag tone={systemState?.collectibleMode ? "info" : "default"}>
                {t("collectibleMode")}: {systemState?.collectibleMode ? t("enabled") : t("disabled")}
              </Tag>
              <Tag tone="info">
                {t("walletCapRemaining")}: {walletCapRemaining !== null ? walletCapRemaining.toString() : "-"}
              </Tag>
              {workspace === "explore" && currentEvent?.category ? (
                <Tag tone="default">{currentEvent.category}</Tag>
              ) : null}
            </div>
          </div>

          {workspace === "organizer" ? (
            <div className="workspace-hero-side workspace-hero-side-ops">
              <div className="workspace-ops-snapshot">
                <small>{topbarCopy.selectedEvent}</small>
                <strong>{currentEvent?.name ?? contractConfig.eventName ?? "ChainTicket"}</strong>
                <span>
                  {selectedEventLocation(currentEvent) ||
                    topbarCopy.dedicatedOps}
                </span>
              </div>
              <div className="workspace-role-row">
                {roleTags.length === 0 ? (
                  <Tag tone="warning">{topbarCopy.noOpsRole}</Tag>
                ) : (
                  roleTags.map((role) => (
                    <Tag key={role} tone="info">
                      {role}
                    </Tag>
                  ))
                )}
              </div>
            </div>
          ) : currentEvent ? (
            <div className="workspace-hero-side">
              <div className="workspace-event-card">
                <EventPoster event={currentEvent} className="workspace-event-poster" />
                <div className="workspace-event-copy">
                  <small>{topbarCopy.selectedEvent}</small>
                  <strong>{currentEvent.name}</strong>
                  <span>{formatEventStart(currentEvent.startsAt)}</span>
                  <em>{selectedEventLocation(currentEvent) || currentEvent.ticketEventId}</em>
                  <Link
                    to={`/app/explore/${currentEvent.ticketEventId}`}
                    className="button-link ghost compact-link"
                  >
                    {topbarCopy.viewEvent}
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {availableEvents.length > 1 ? (
          <section className="workspace-event-strip" aria-label={topbarCopy.availableEvents}>
            {availableEvents.map((event) => (
              <button
                key={event.ticketEventId}
                type="button"
                className={event.ticketEventId === selectedEventId ? "workspace-event-pill active" : "workspace-event-pill"}
                onClick={() => handleEventSwitch(event.ticketEventId)}
              >
                <strong>{event.name}</strong>
                <span>{formatEventStart(event.startsAt)}</span>
              </button>
            ))}
          </section>
        ) : null}

        {workspace === "organizer" ? (
          <nav className="workspace-subnav" aria-label="Organizer navigation">
            {organizerNavigation.map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.key === "overview"}
                className={item.key === organizerSubroute ? "workspace-subnav-link active" : "workspace-subnav-link"}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        ) : null}

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
            title={locale === "fr" ? "Configuration frontend bloquante" : "Frontend configuration blocked"}
            cause={configIssues.join(" | ")}
            impact={
              locale === "fr"
                ? "Le wallet et les lectures on-chain restent indisponibles tant que l'environnement est incomplet."
                : "Wallet and on-chain reads stay unavailable until the environment is corrected."
            }
            action={
              locale === "fr"
                ? "Mettez a jour frontend/.env avec les variables VITE_* puis relancez l'application."
                : "Update frontend/.env with VITE_* keys, then restart the app."
            }
          />
        ) : null}

        {hasValidConfig && runtimeConfig.apiBaseUrl && indexedReadsIssue ? (
          <RiskBanner
            tone={bffMode === "offline" ? "error" : "warning"}
            title={locale === "fr" ? "Lectures indexees indisponibles" : "Indexed reads unavailable"}
            cause={indexedReadsIssue}
            impact={
              locale === "fr"
                ? "Les vues enrichies du marche, des billets et de l'ops restent degradees jusqu'au rattrapage du BFF."
                : "Enriched marketplace, tickets, and ops views stay degraded until the BFF catches up."
            }
            action={
              locale === "fr"
                ? "Gardez le BFF actif, confirmez le deployment block, puis laissez l'indexation finir."
                : "Keep the BFF running, confirm the deployment block, and let indexing catch up."
            }
          />
        ) : null}

        <main className="workspace-content-shell" id="main-content">
          <section className="workspace-content">
            <Outlet />
          </section>
        </main>
      </div>

      {isMobile ? (
        <nav className="bottom-nav" aria-label="Primary mobile navigation">
          {mainNavigation.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) => (isActive ? "bottom-link active" : "bottom-link")}
            >
              <span className="bottom-glyph" aria-hidden="true">
                {item.label.slice(0, 1)}
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
