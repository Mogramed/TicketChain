import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  Badge,
  ButtonGroup,
  Card,
  EmptyState,
  InfoList,
  PageHeader,
  Panel,
  SectionHeader,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { TicketMedia } from "../components/tickets/TicketMedia";
import { TicketQrPanel } from "../components/tickets/TicketQrPanel";
import { IndexedReadinessBanner } from "../components/layout/IndexedReadinessBanner";
import { useI18n } from "../i18n/I18nContext";
import { formatAddress, formatPol, formatTimestamp } from "../lib/format";
import { buildTokenUriFromBase } from "../lib/ticketMetadata";
import { parseTokenIdInput, timelineLabel } from "../lib/timeline";
import { useTicketPreviewCollection } from "../lib/useTicketPreviewCollection";
import { useAppState } from "../state/useAppState";
import type { TicketTimelineEntry } from "../types/chainticket";

function phaseForEntry(entry: TicketTimelineEntry): string {
  if (entry.kind === "mint") {
    return "Mint";
  }
  if (entry.kind === "listed" || entry.kind === "cancelled") {
    return "Listing";
  }
  if (entry.kind === "sold" || entry.kind === "transfer") {
    return "Ownership";
  }
  if (entry.kind === "used") {
    return "Usage";
  }
  return "Metadata";
}

function phaseBadgeLabel(entry: TicketTimelineEntry): string {
  switch (entry.kind) {
    case "mint":
      return "MINT";
    case "listed":
      return "LISTED";
    case "sold":
      return "SOLD";
    case "used":
      return "USED";
    case "cancelled":
      return "CANCELLED";
    case "transfer":
      return "TRANSFER";
    default:
      return "UPDATE";
  }
}

function phaseBadgeTone(entry: TicketTimelineEntry): "success" | "info" | "warning" | "default" {
  switch (entry.kind) {
    case "mint":
      return "success";
    case "listed":
    case "sold":
      return "info";
    case "used":
      return "warning";
    default:
      return "default";
  }
}

export function TicketDetailPage() {
  const { t } = useI18n();
  const { tokenId: tokenIdParam } = useParams<{ tokenId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    fetchTicketTimeline,
    contractConfig,
    indexedReadsAvailable,
    tickets,
    systemState,
    selectedEventName,
    watchlist,
    toggleWatch,
    availableEvents,
    selectedEventId,
  } = useAppState();
  const selectedEvent =
    availableEvents.find((event) => event.ticketEventId === selectedEventId) ?? null;
  const tokenId = tokenIdParam ? parseTokenIdInput(tokenIdParam) : null;
  const ticket = useMemo(
    () =>
      tokenId === null
        ? null
        : tickets.find((candidate) => candidate.tokenId === tokenId) ?? null,
    [tickets, tokenId],
  );
  const liveTokenUri =
    tokenId !== null
      ? buildTokenUriFromBase(systemState?.baseTokenURI, tokenId) ??
        (!systemState?.collectibleMode ? ticket?.tokenURI ?? null : null)
      : null;
  const collectibleTokenUri =
    tokenId !== null
      ? buildTokenUriFromBase(systemState?.collectibleBaseURI, tokenId) ??
        (systemState?.collectibleMode ? ticket?.tokenURI ?? null : null)
      : null;
  const activeTokenUri =
    ticket?.tokenURI ??
    (systemState?.collectibleMode
      ? collectibleTokenUri ?? liveTokenUri ?? ""
      : liveTokenUri ?? collectibleTokenUri ?? "");
  const previewDescriptors = useMemo(
    () =>
      tokenId !== null && activeTokenUri
        ? [
            {
              key: tokenId.toString(),
              tokenId,
              ticketEventId: contractConfig.eventId,
              activeTokenUri,
              activeView: systemState?.collectibleMode
                ? ("collectible" as const)
                : ("live" as const),
              liveTokenUri,
              collectibleTokenUri,
            },
          ]
        : [],
    [
      activeTokenUri,
      collectibleTokenUri,
      contractConfig.eventId,
      liveTokenUri,
      systemState?.collectibleMode,
      tokenId,
    ],
  );
  const previews = useTicketPreviewCollection(previewDescriptors);
  const preview = tokenId !== null ? previews.get(tokenId.toString()) : null;
  const requestedViewParam = searchParams.get("view");
  const displayView: "live" | "collectible" =
    requestedViewParam === "collectible"
      ? "collectible"
      : requestedViewParam === "live"
        ? "live"
        : systemState?.collectibleMode
          ? "collectible"
          : "live";
  const eventWatchKey =
    tokenId !== null
      ? `${contractConfig.eventId ?? "main-event"}:${tokenId.toString()}`
      : null;

  const timelineQuery = useQuery({
    queryKey: ["ticket-timeline", tokenId?.toString() ?? "none"],
    enabled: tokenId !== null,
    queryFn: async () => {
      if (tokenId === null) {
        return [];
      }
      return fetchTicketTimeline(tokenId);
    },
  });

  const grouped = useMemo(() => {
    const groups = new Map<string, TicketTimelineEntry[]>();
    for (const entry of timelineQuery.data ?? []) {
      const phase = phaseForEntry(entry);
      const current = groups.get(phase) ?? [];
      current.push(entry);
      groups.set(phase, current);
    }
    return [...groups.entries()];
  }, [timelineQuery.data]);

  const selectedMetadata =
    displayView === "collectible"
      ? preview?.collectibleMetadata ?? preview?.activeMetadata ?? null
      : preview?.liveMetadata ?? preview?.activeMetadata ?? null;
  const selectedMedia =
    displayView === "collectible"
      ? preview?.collectibleMedia ?? preview?.activeMedia
      : preview?.liveMedia ?? preview?.activeMedia;
  const selectedQrValue =
    displayView === "collectible"
      ? preview?.collectibleQrValue ?? preview?.liveQrValue
      : preview?.liveQrValue ?? preview?.collectibleQrValue;

  return (
    <div className="route-stack ticket-detail-route" data-testid="ticket-detail-page">
      <PageHeader
        title={`${selectedMetadata?.name ?? "Ticket pass"} ${tokenId !== null ? `#${tokenId.toString()}` : ""}`}
        subtitle="Pass + Proof view: collectible-ready artwork up top, lifecycle evidence below."
        context={
          <div className="inline-actions">
            <Tag tone={ticket?.used ? "warning" : "success"}>
              {ticket?.used ? t("ticketUsed") : t("ticketValid")}
            </Tag>
            {systemState?.collectibleMode ? (
              <Tag tone="info">Collectible live</Tag>
            ) : preview?.collectibleTokenUri ? (
              <Tag tone="success">Collectible preview ready</Tag>
            ) : null}
            {ticket?.listed ? <Tag tone="warning">Listed on market</Tag> : null}
          </div>
        }
        primaryAction={
          <Link to="/app/tickets" className="button-link ghost">
            {t("myTicketsTitle")}
          </Link>
        }
        secondaryActions={
          tokenId !== null ? (
            <ButtonGroup compact>
              <button type="button" className="ghost" onClick={() => toggleWatch(tokenId)}>
                {eventWatchKey && watchlist.has(eventWatchKey) ? t("unwatch") : t("watch")}
              </button>
            </ButtonGroup>
          ) : null
        }
      />

      <EventDemoNotice event={selectedEvent} />

      {tokenId === null ? <EmptyState title="Invalid token" description="Token id format is not valid." /> : null}
      {tokenId !== null && !indexedReadsAvailable ? (
        <IndexedReadinessBanner
          title="Indexed timeline delayed"
          impact="Pass data stays available from direct chain reads while indexed lifecycle enrichment catches up."
        />
      ) : null}

      {tokenId !== null ? (
        <Panel className="ticket-detail-hero">
          <div className="ticket-detail-pass">
            <div className="ticket-detail-pass-top">
              <div>
                <p className="eyebrow">Verified pass</p>
                <h2>{selectedEventName || contractConfig.eventName || "ChainTicket event"}</h2>
                <p>
                  {selectedMetadata?.description ??
                    "Investor-friendly pass view with wallet ownership, QR entry, and collectible narrative."}
                </p>
              </div>
              {preview?.liveTokenUri && preview?.collectibleTokenUri ? (
                <SegmentedToggle<"live" | "collectible">
                  value={displayView}
                  onChange={(next) => {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.set("view", next);
                    setSearchParams(nextParams, { replace: true });
                  }}
                  options={[
                    { value: "live", label: "Live pass" },
                    { value: "collectible", label: "Collectible" },
                  ]}
                  ariaLabel="Ticket pass preview mode"
                />
              ) : null}
            </div>

            <div className="ticket-detail-pass-grid">
              <Card className="ticket-detail-artwork-card">
                <TicketMedia
                  media={
                    selectedMedia ?? {
                      kind: "fallback",
                      src: null,
                      posterSrc: null,
                      alt: `Ticket #${tokenId.toString()}`,
                    }
                  }
                  fallbackTitle={selectedEventName || "ChainTicket admission"}
                  fallbackSubtitle={`Token #${tokenId.toString()}`}
                  className="ticket-detail-media"
                />
                <div className="ticket-detail-media-meta">
                  <Badge tone={displayView === "collectible" ? "info" : "default"}>
                    {displayView === "collectible" ? "Collectible mode" : "Ticket mode"}
                  </Badge>
                  {preview?.isLoading ? <Tag tone="default">Loading media</Tag> : null}
                  {preview?.errorMessage ? <Tag tone="warning">Metadata fallback</Tag> : null}
                </div>
              </Card>

              <div className="ticket-detail-side">
                {selectedQrValue ? (
                  <TicketQrPanel
                    value={selectedQrValue}
                    title="Mobile entry QR"
                    subtitle="This QR encodes the ticket route and token id used by the scanner fallback."
                  />
                ) : null}

                <Card className="ticket-detail-facts">
                  <InfoList
                    entries={[
                      { label: "Token", value: `#${tokenId.toString()}` },
                      { label: "Owner", value: ticket ? formatAddress(ticket.owner) : "Timeline view" },
                      {
                        label: "Listing",
                        value:
                          ticket?.listed && ticket.listingPrice
                            ? `${formatPol(ticket.listingPrice)} POL`
                            : "Not listed",
                      },
                      {
                        label: "Collectible mode",
                        value: systemState?.collectibleMode ? "Active" : "Standby",
                      },
                    ]}
                  />
                </Card>
              </div>
            </div>

            {(selectedMetadata?.attributes.length ?? 0) > 0 ? (
              <div className="ticket-detail-attribute-grid">
                {selectedMetadata!.attributes.slice(0, 8).map((attribute) => (
                  <div key={`${attribute.traitType}-${attribute.value}`} className="ticket-attribute-chip">
                    <span>{attribute.traitType}</span>
                    <strong>{attribute.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {timelineQuery.isLoading ? (
        <EmptyState title="Loading timeline" description={t("timelineLoading")} />
      ) : null}
      {!timelineQuery.isLoading && (timelineQuery.data?.length ?? 0) === 0 ? (
        <EmptyState
          title={t("emptyTimelineTitle")}
          description={t("emptyTimelineReason")}
          action={
            <Link to="/app/tickets" className="button-link ghost">
              {t("myTicketsTitle")}
            </Link>
          }
        />
      ) : null}

      <Panel className="primary-panel">
        {grouped.length > 0 ? (
          <section className="phase-summary">
            <SectionHeader
              title="Lifecycle proof"
              subtitle="Mint, market activity, usage, and metadata changes grouped by phase."
            />
            <div className="phase-summary-chips">
              {grouped.map(([phase, entries]) => (
                <Tag key={phase} tone="info" className="phase-chip">
                  {phase}: {entries.length}
                </Tag>
              ))}
            </div>
          </section>
        ) : null}

        <section className="timeline-list">
          {(timelineQuery.data ?? []).map((entry) => (
                <Card key={entry.id} className="timeline-item">
                  <div className="timeline-marker" aria-hidden="true" />
                  <div className="timeline-content">
                    <header>
                      <h3>{timelineLabel(entry.kind)}</h3>
                      <div className="inline-actions">
                        <Badge tone={phaseBadgeTone(entry)}>{phaseBadgeLabel(entry)}</Badge>
                        <Badge tone="info">
                          {entry.timestamp ? formatTimestamp(entry.timestamp * 1000) : `Block ${entry.blockNumber}`}
                        </Badge>
                      </div>
                    </header>
                    <p>{entry.description}</p>
                    <a href={`${contractConfig.explorerTxBaseUrl}${entry.txHash}`} target="_blank" rel="noreferrer">
                      {formatAddress(entry.txHash, 8)}
                    </a>
                  </div>
                </Card>
              ))}
        </section>
      </Panel>
    </div>
  );
}
