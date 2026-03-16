import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  EmptyState,
  PageHeader,
  Panel,
  SectionHeader,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { TicketMedia } from "../components/tickets/TicketMedia";
import { IndexedReadinessBanner } from "../components/layout/IndexedReadinessBanner";
import { useI18n } from "../i18n/I18nContext";
import { formatAddress, formatPol } from "../lib/format";
import {
  buildTokenUriFromBase,
} from "../lib/ticketMetadata";
import { useTicketPreviewCollection } from "../lib/useTicketPreviewCollection";
import { useAppState } from "../state/useAppState";

type TicketViewMode = "card" | "table";

function resolvePreviewDescriptor(args: {
  tokenId: bigint;
  eventId?: string;
  tokenUri: string;
  collectibleMode: boolean;
  baseTokenURI?: string;
  collectibleBaseURI?: string;
}) {
  const liveTokenUri = buildTokenUriFromBase(args.baseTokenURI, args.tokenId);
  const collectibleTokenUri = buildTokenUriFromBase(
    args.collectibleBaseURI,
    args.tokenId,
  );

  return {
    activeTokenUri: args.tokenUri,
    activeView: args.collectibleMode ? ("collectible" as const) : ("live" as const),
    liveTokenUri: liveTokenUri ?? (args.collectibleMode ? null : args.tokenUri),
    collectibleTokenUri:
      collectibleTokenUri ?? (args.collectibleMode ? args.tokenUri : null),
    ticketEventId: args.eventId,
  };
}

export function TicketsPage() {
  const { t } = useI18n();
  const {
    tickets,
    walletAddress,
    watchlist,
    toggleWatch,
    refreshDashboard,
    uiMode,
    connectWallet,
    contractConfig,
    indexedReadsAvailable,
    systemState,
    selectedEventName,
    availableEvents,
    selectedEventId,
  } = useAppState();
  const selectedEvent =
    availableEvents.find((event) => event.ticketEventId === selectedEventId) ?? null;
  const [viewMode, setViewMode] = useState<TicketViewMode>("card");
  const eventWatchKey = (tokenId: bigint) =>
    `${contractConfig.eventId ?? "main-event"}:${tokenId.toString()}`;

  const sortedTickets = useMemo(
    () => [...tickets].sort((left, right) => (left.tokenId > right.tokenId ? -1 : 1)),
    [tickets],
  );

  const ticketCounters = useMemo(() => {
    let valid = 0;
    let used = 0;
    let listed = 0;

    for (const ticket of sortedTickets) {
      if (ticket.used) {
        used += 1;
      } else {
        valid += 1;
      }
      if (ticket.listed) {
        listed += 1;
      }
    }

    return { valid, used, listed };
  }, [sortedTickets]);

  const previewDescriptors = useMemo(
    () =>
      sortedTickets.map((ticket) => ({
        key: ticket.tokenId.toString(),
        tokenId: ticket.tokenId,
        ...resolvePreviewDescriptor({
          tokenId: ticket.tokenId,
          eventId: contractConfig.eventId,
          tokenUri: ticket.tokenURI,
          collectibleMode: Boolean(systemState?.collectibleMode),
          baseTokenURI: systemState?.baseTokenURI,
          collectibleBaseURI: systemState?.collectibleBaseURI,
        }),
      })),
    [
      contractConfig.eventId,
      sortedTickets,
      systemState?.baseTokenURI,
      systemState?.collectibleBaseURI,
      systemState?.collectibleMode,
    ],
  );
  const previews = useTicketPreviewCollection(previewDescriptors);

  return (
    <div className="route-stack tickets-route" data-testid="tickets-page">
      <PageHeader
        title={t("myTicketsTitle")}
        subtitle="Mobile-entry passes, collectible reveal readiness, and verified ownership in one investor-friendly view."
        context={
          <div className="inline-actions">
            <Badge tone={walletAddress ? "success" : "warning"}>
              {walletAddress ? "Wallet connected" : "Wallet not connected"}
            </Badge>
            <Badge tone="success">{`Valid: ${ticketCounters.valid}`}</Badge>
            <Badge tone="warning">{`Checked-in: ${ticketCounters.used}`}</Badge>
            <Badge tone="info">{`Listed: ${ticketCounters.listed}`}</Badge>
            <Tag tone={systemState?.collectibleMode ? "info" : "default"}>
              {systemState?.collectibleMode ? "Collectible live" : "Collectible reveal ready"}
            </Tag>
          </div>
        }
        primaryAction={
          <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
            {t("refresh")}
          </button>
        }
        secondaryActions={
          <SegmentedToggle<TicketViewMode>
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "card", label: "Passes" },
              { value: "table", label: "Table" },
            ]}
            ariaLabel="Ticket inventory view mode"
          />
        }
      />

      <EventDemoNotice event={selectedEvent} />

      {!walletAddress ? (
        <EmptyState
          title={t("emptyWalletTitle")}
          description={t("emptyWalletTicketsReason")}
          action={
            <button type="button" className="primary" onClick={() => void connectWallet()}>
              {t("connectWallet")}
            </button>
          }
        />
      ) : null}

      {walletAddress && !indexedReadsAvailable ? (
        <IndexedReadinessBanner
          title="Indexed enrichments delayed"
          impact="Your passes stay visible from direct on-chain reads while indexed timeline and analytics catch up."
        />
      ) : null}

      {walletAddress && indexedReadsAvailable && sortedTickets.length === 0 ? (
        <EmptyState
          title={t("emptyTicketsTitle")}
          description={t("emptyTicketsReason")}
          action={
            <Link to="/app/fan" className="button-link primary">
              {t("mintPrimaryTicket")}
            </Link>
          }
        />
      ) : null}

      {walletAddress && sortedTickets.length > 0 ? (
        <Panel className="ticket-portfolio-shell">
          <div className="ticket-portfolio-copy">
            <p className="eyebrow">Verified ownership</p>
            <h2>{selectedEventName || contractConfig.eventName || "Live event passes"}</h2>
            <p>
              Each pass is blockchain-verified, resale-aware, and ready to become a collectible the
              moment post-event metadata is activated.
            </p>
          </div>
          <div className="ticket-portfolio-stats">
            <Card className="ticket-portfolio-stat">
              <span>Live entry</span>
              <strong>{ticketCounters.valid}</strong>
            </Card>
            <Card className="ticket-portfolio-stat">
              <span>Collectible mode</span>
              <strong>{systemState?.collectibleMode ? "On" : "Standby"}</strong>
            </Card>
            <Card className="ticket-portfolio-stat">
              <span>Market-ready</span>
              <strong>{ticketCounters.listed}</strong>
            </Card>
          </div>
        </Panel>
      ) : null}

      {walletAddress && sortedTickets.length > 0 ? (
        <SectionHeader
          title="Your passes"
          subtitle="Ticketmaster-style confidence on top, collectible storytelling inside every pass."
          actions={<Badge tone="info">{sortedTickets.length.toString()}</Badge>}
        />
      ) : null}

      {walletAddress && sortedTickets.length > 0 && viewMode === "card" ? (
        <section className="ticket-pass-grid">
          {sortedTickets.map((ticket) => {
            const preview = previews.get(ticket.tokenId.toString());
            const activeMetadata = preview?.activeMetadata;
            const activeMedia = preview?.activeMedia;
            const revealReady =
              Boolean(preview?.collectibleTokenUri) &&
              !systemState?.collectibleMode;
            const listingLabel = ticket.listed
              ? `${formatPol(ticket.listingPrice ?? 0n)} POL`
              : "Not listed";

            return (
              <Card key={ticket.tokenId.toString()} className="ticket-pass-card">
                <div className="ticket-pass-visual">
                  <TicketMedia
                    media={
                      activeMedia ?? {
                        kind: "fallback",
                        src: null,
                        posterSrc: null,
                        alt: `Ticket #${ticket.tokenId.toString()}`,
                      }
                    }
                    fallbackTitle={selectedEventName || `Ticket #${ticket.tokenId.toString()}`}
                    fallbackSubtitle={`Token #${ticket.tokenId.toString()}`}
                  />
                  <div className="ticket-pass-overlay">
                    <Tag tone="default">{selectedEventName || contractConfig.eventName || "ChainTicket"}</Tag>
                    <Tag tone={ticket.used ? "warning" : "success"}>
                      {ticket.used ? t("ticketUsed") : t("ticketValid")}
                    </Tag>
                  </div>
                </div>

                <div className="ticket-pass-copy">
                  <div className="ticket-pass-heading">
                    <div>
                      <p className="ticket-pass-kicker">Mobile entry pass</p>
                      <h3>{activeMetadata?.name ?? `Admission pass #${ticket.tokenId.toString()}`}</h3>
                    </div>
                    <Badge tone={systemState?.collectibleMode ? "info" : "default"}>
                      {systemState?.collectibleMode ? "Collectible live" : "Ticket live"}
                    </Badge>
                  </div>

                  <p className="ticket-pass-description">
                    {activeMetadata?.description ??
                      "Wallet-controlled access with collectible-ready metadata and resale guardrails."}
                  </p>

                  <div className="ticket-pass-meta">
                    <span>{`Token #${ticket.tokenId.toString()}`}</span>
                    <span>{formatAddress(ticket.owner)}</span>
                    <span>{listingLabel}</span>
                  </div>

                  <div className="ticket-pass-attribute-row">
                    <Tag tone="info">QR ready</Tag>
                    {revealReady ? <Tag tone="success">Collectible preview available</Tag> : null}
                    {ticket.listed ? <Tag tone="warning">Listed on market</Tag> : null}
                    {preview?.isLoading ? <Tag tone="default">Loading artwork</Tag> : null}
                  </div>

                  {(activeMetadata?.attributes.length ?? 0) > 0 ? (
                    <div className="ticket-pass-attribute-grid">
                      {activeMetadata!.attributes.slice(0, 4).map((attribute) => (
                        <div key={`${ticket.tokenId.toString()}-${attribute.traitType}`} className="ticket-attribute-chip">
                          <span>{attribute.traitType}</span>
                          <strong>{attribute.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <ButtonGroup>
                    <Link to={`/app/tickets/${ticket.tokenId.toString()}`} className="button-link primary">
                      Open pass
                    </Link>
                    <button type="button" className="ghost" onClick={() => toggleWatch(ticket.tokenId)}>
                      {watchlist.has(eventWatchKey(ticket.tokenId)) ? t("unwatch") : t("watch")}
                    </button>
                  </ButtonGroup>
                </div>
              </Card>
            );
          })}
        </section>
      ) : walletAddress && sortedTickets.length > 0 ? (
        <Panel className="tickets-table-panel">
          <table className="market-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Pass</th>
                <th>Status</th>
                <th>Listing</th>
                <th>Preview</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((ticket) => {
                const preview = previews.get(ticket.tokenId.toString());

                return (
                  <tr key={ticket.tokenId.toString()}>
                    <td>#{ticket.tokenId.toString()}</td>
                    <td>{preview?.activeMetadata?.name ?? "Admission pass"}</td>
                    <td>{ticket.used ? t("ticketUsed") : t("ticketValid")}</td>
                    <td>{ticket.listed ? `${formatPol(ticket.listingPrice ?? 0n)} POL` : "-"}</td>
                    <td>{preview?.collectibleTokenUri ? "Reveal ready" : "Current state only"}</td>
                    <td>
                      <ButtonGroup>
                        <Link to={`/app/tickets/${ticket.tokenId.toString()}`} className="button-link ghost">
                          Open pass
                        </Link>
                        <button type="button" className="ghost" onClick={() => toggleWatch(ticket.tokenId)}>
                          {watchlist.has(eventWatchKey(ticket.tokenId)) ? t("unwatch") : t("watch")}
                        </button>
                      </ButtonGroup>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ) : null}

      <DetailAccordion
        title="Pass guide"
        subtitle="How investors and operators should read these states"
        defaultOpenDesktop={uiMode === "advanced"}
      >
        <ul className="plain-list">
          <li>Each pass is tied to the connected wallet and backed by on-chain ownership.</li>
          <li>Collectible preview becomes available as soon as live and collectible metadata URIs are known.</li>
          <li>The pass detail page exposes the QR, artwork, metadata traits, and lifecycle proof in one place.</li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
