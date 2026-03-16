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
import { getTicketPerks, getTicketStateLabel } from "../lib/workspaceContent";
import { useTicketPreviewCollection } from "../lib/useTicketPreviewCollection";
import { useAppState } from "../state/useAppState";
import type { Locale } from "../i18n/messages";
import type { TicketTimelineEntry } from "../types/chainticket";

function phaseForEntry(entry: TicketTimelineEntry, locale: Locale): string {
  if (entry.kind === "mint") {
    return locale === "fr" ? "Mint" : "Mint";
  }
  if (entry.kind === "listed" || entry.kind === "cancelled") {
    return locale === "fr" ? "Revente" : "Listing";
  }
  if (entry.kind === "sold" || entry.kind === "transfer") {
    return locale === "fr" ? "Propriete" : "Ownership";
  }
  if (entry.kind === "used") {
    return locale === "fr" ? "Usage" : "Usage";
  }
  return locale === "fr" ? "Metadonnees" : "Metadata";
}

function phaseBadgeLabel(entry: TicketTimelineEntry, locale: Locale): string {
  switch (entry.kind) {
    case "mint":
      return locale === "fr" ? "MINT" : "MINT";
    case "listed":
      return locale === "fr" ? "LISTE" : "LISTED";
    case "sold":
      return locale === "fr" ? "VENDU" : "SOLD";
    case "used":
      return locale === "fr" ? "UTILISE" : "USED";
    case "cancelled":
      return locale === "fr" ? "ANNULE" : "CANCELLED";
    case "transfer":
      return locale === "fr" ? "TRANSFERT" : "TRANSFER";
    default:
      return locale === "fr" ? "MISE A JOUR" : "UPDATE";
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
  const { locale, t } = useI18n();
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
              activeView: systemState?.collectibleMode ? ("collectible" as const) : ("live" as const),
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
  const collectibleReady = Boolean(preview?.collectibleTokenUri) && !systemState?.collectibleMode;
  const stateLabel =
    ticket && tokenId !== null
      ? getTicketStateLabel({
          locale,
          ticket,
          collectibleMode: Boolean(systemState?.collectibleMode),
          collectibleReady,
        })
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
      const phase = phaseForEntry(entry, locale);
      const current = groups.get(phase) ?? [];
      current.push(entry);
      groups.set(phase, current);
    }
    return [...groups.entries()];
  }, [locale, timelineQuery.data]);

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
  const copy =
    locale === "fr"
      ? {
          invalidToken: "Token invalide",
          invalidDescription: "Le format du token id n'est pas valide.",
          subtitle:
            "La page phare du produit: pass hero, statut lisible, QR bien visible, perks et preuve de cycle de vie a la demande.",
          collectibleLive: "Collectible actif",
          collectiblePreview: "Apercu collectible",
          listedOnMarket: "Liste sur le marche",
          delayedTitle: "Timeline indexee en attente",
          delayedImpact:
            "Les donnees du pass restent visibles en lecture directe on-chain pendant que la timeline enrichie se resynchronise.",
          premiumPass: "Pass premium",
          chainEvent: "Evenement ChainTicket",
          heroFallback:
            "La vue pass met la confiance au premier plan, puis laisse la preuve de cycle de vie vivre plus bas au lieu d'injecter du jargon blockchain partout.",
          livePass: "Pass live",
          collectibleMode: "Collectible",
          ticketMode: "Mode billet",
          metadataFallback: "Fallback metadonnees",
          loadingMedia: "Chargement media",
          qrTitle: "QR d'entree mobile",
          qrSubtitle: "Pret pour le scanner terrain et la resolution manuelle en secours.",
          tokenLabel: "Token",
          ownerLabel: "Proprietaire",
          listingLabel: "Annonce",
          notListed: "Non liste",
          collectibleStatus: "Mode collectible",
          active: "Actif",
          standby: "En attente",
          statusLabel: "Statut",
          manageResale: "Gerer la revente",
          passReady: "Pass pret",
          timelineLoadingTitle: "Chargement de la timeline",
          lifecycleTitle: "Preuve de cycle de vie",
          lifecycleSubtitle: "Mint, revente, usage et metadonnees regroupes par phase pour ne pas surcharger le hero.",
        }
      : {
          invalidToken: "Invalid token",
          invalidDescription: "Token id format is not valid.",
          subtitle:
            "The product hero page: pass-first visual, readable status, visible QR, perks, and lifecycle proof on demand.",
          collectibleLive: "Collectible live",
          collectiblePreview: "Collectible preview",
          listedOnMarket: "Listed on market",
          delayedTitle: "Indexed timeline delayed",
          delayedImpact: "Pass data stays visible from direct chain reads while indexed lifecycle enrichment catches up.",
          premiumPass: "Premium pass",
          chainEvent: "ChainTicket event",
          heroFallback:
            "The pass view leads with confidence, then lets lifecycle proof live below instead of forcing blockchain language into the hero section.",
          livePass: "Live pass",
          collectibleMode: "Collectible",
          ticketMode: "Ticket mode",
          metadataFallback: "Metadata fallback",
          loadingMedia: "Loading media",
          qrTitle: "Mobile entry QR",
          qrSubtitle: "Ready for scanner mode and fallback ticket resolution.",
          tokenLabel: "Token",
          ownerLabel: "Owner",
          listingLabel: "Listing",
          notListed: "Not listed",
          collectibleStatus: "Collectible mode",
          active: "Active",
          standby: "Standby",
          statusLabel: "Status",
          manageResale: "Manage resale",
          passReady: "Pass ready",
          timelineLoadingTitle: "Loading timeline",
          lifecycleTitle: "Lifecycle proof",
          lifecycleSubtitle: "Mint, resale, usage, and metadata events grouped by phase instead of crowding the hero.",
        };

  if (tokenId === null) {
    return (
      <div className="route-stack ticket-detail-route" data-testid="ticket-detail-page">
        <EmptyState title={copy.invalidToken} description={copy.invalidDescription} />
      </div>
    );
  }

  return (
    <div className="route-stack ticket-detail-route detail-vault-route" data-testid="ticket-detail-page">
      <PageHeader
        title={`${selectedMetadata?.name ?? "Ticket pass"} #${tokenId.toString()}`}
        subtitle={copy.subtitle}
        workspace="tickets"
        context={
          <div className="inline-actions">
            {stateLabel ? <Tag tone={ticket?.used ? "warning" : ticket?.listed ? "info" : "success"}>{stateLabel}</Tag> : null}
            {systemState?.collectibleMode ? <Tag tone="info">{copy.collectibleLive}</Tag> : null}
            {collectibleReady ? <Tag tone="success">{copy.collectiblePreview}</Tag> : null}
            {ticket?.listed ? <Tag tone="warning">{copy.listedOnMarket}</Tag> : null}
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

      {!indexedReadsAvailable ? (
        <IndexedReadinessBanner
          title={copy.delayedTitle}
          impact={copy.delayedImpact}
        />
      ) : null}

      <section className="ticket-detail-shell">
        <Panel className="ticket-detail-main-card" surface="glass">
          <div className="ticket-detail-pass-top">
            <div>
              <p className="eyebrow">{copy.premiumPass}</p>
              <h2>{selectedEventName || contractConfig.eventName || copy.chainEvent}</h2>
              <p>{selectedMetadata?.description ?? copy.heroFallback}</p>
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
                  { value: "live", label: copy.livePass },
                  { value: "collectible", label: copy.collectibleMode },
                ]}
                ariaLabel="Ticket pass preview mode"
              />
            ) : null}
          </div>

          <div className="ticket-detail-pass-grid">
            <Card className="ticket-detail-artwork-card" surface="accent">
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
                <Badge tone={displayView === "collectible" ? "info" : "default"} emphasis="solid">
                  {displayView === "collectible" ? copy.collectibleMode : copy.ticketMode}
                </Badge>
                {preview?.isLoading ? <Tag tone="default">{copy.loadingMedia}</Tag> : null}
                {preview?.errorMessage ? <Tag tone="warning">{copy.metadataFallback}</Tag> : null}
              </div>
            </Card>

            <div className="ticket-detail-side sticky-stack">
              {selectedQrValue ? (
                <TicketQrPanel
                  value={selectedQrValue}
                  title={copy.qrTitle}
                  subtitle={copy.qrSubtitle}
                />
              ) : null}

              <Card className="ticket-detail-facts" surface="glass">
                <InfoList
                  entries={[
                    { label: copy.tokenLabel, value: `#${tokenId.toString()}` },
                    { label: copy.ownerLabel, value: ticket ? formatAddress(ticket.owner) : "Timeline view" },
                    {
                      label: copy.listingLabel,
                      value:
                        ticket?.listed && ticket.listingPrice
                          ? `${formatPol(ticket.listingPrice)} POL`
                          : copy.notListed,
                    },
                    {
                      label: copy.collectibleStatus,
                      value: systemState?.collectibleMode ? copy.active : copy.standby,
                    },
                    {
                      label: copy.statusLabel,
                      value: stateLabel ?? "-",
                    },
                  ]}
                />
                <div className="ticket-detail-side-actions">
                  <Link
                    to={
                      ticket?.listed
                        ? "/app/marketplace"
                        : `/app/tickets/${tokenId.toString()}${collectibleReady ? "?view=collectible" : ""}`
                    }
                    className="button-link primary"
                  >
                    {ticket?.listed ? copy.manageResale : collectibleReady ? copy.collectiblePreview : copy.passReady}
                  </Link>
                </div>
              </Card>
            </div>
          </div>

          <div className="ticket-detail-attribute-grid">
            {getTicketPerks(locale).map((perk) => (
              <div key={perk} className="ticket-attribute-chip">
                <span>Perk</span>
                <strong>{perk}</strong>
              </div>
            ))}
            {(selectedMetadata?.attributes ?? []).slice(0, 5).map((attribute) => (
              <div key={`${attribute.traitType}-${attribute.value}`} className="ticket-attribute-chip">
                <span>{attribute.traitType}</span>
                <strong>{attribute.value}</strong>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {timelineQuery.isLoading ? <EmptyState title={copy.timelineLoadingTitle} description={t("timelineLoading")} /> : null}
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

      <Panel className="primary-panel" surface="glass">
        {grouped.length > 0 ? (
          <section className="phase-summary">
            <SectionHeader
              title={copy.lifecycleTitle}
              subtitle={copy.lifecycleSubtitle}
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
            <Card key={entry.id} className="timeline-item" surface="quiet">
              <div className="timeline-marker" aria-hidden="true" />
              <div className="timeline-content">
                <header>
                  <h3>{timelineLabel(entry.kind)}</h3>
                  <div className="inline-actions">
                    <Badge tone={phaseBadgeTone(entry)}>{phaseBadgeLabel(entry, locale)}</Badge>
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
