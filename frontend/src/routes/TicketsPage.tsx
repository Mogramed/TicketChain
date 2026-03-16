import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  ProgressStepper,
  SectionHeader,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { TicketMedia } from "../components/tickets/TicketMedia";
import { IndexedReadinessBanner } from "../components/layout/IndexedReadinessBanner";
import { useI18n } from "../i18n/I18nContext";
import { formatAddress, formatPol } from "../lib/format";
import { buildTokenUriFromBase } from "../lib/ticketMetadata";
import {
  getTicketPerks,
  getTicketStateLabel,
} from "../lib/workspaceContent";
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
  const collectibleTokenUri = buildTokenUriFromBase(args.collectibleBaseURI, args.tokenId);

  return {
    activeTokenUri: args.tokenUri,
    activeView: args.collectibleMode ? ("collectible" as const) : ("live" as const),
    liveTokenUri: liveTokenUri ?? (args.collectibleMode ? null : args.tokenUri),
    collectibleTokenUri: collectibleTokenUri ?? (args.collectibleMode ? args.tokenUri : null),
    ticketEventId: args.eventId,
  };
}

export function TicketsPage() {
  const { locale, t } = useI18n();
  const {
    tickets,
    walletAddress,
    watchlist,
    toggleWatch,
    refreshDashboard,
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

  const copy =
    locale === "fr"
      ? {
          title: "Ticket Vault",
          subtitle:
            "Le vault remplace la simple liste: chaque pass ressemble a un credential premium avec statut clair, QR visible, perks et potentiel collectible.",
          inventoryTitle: "Vos passes",
          inventorySubtitle: "Des cartes-pass plus belles et plus utiles, avec une action principale selon l'etat.",
          emptyTitle: "Aucun pass dans ce wallet",
          emptyDescription: "Connectez un wallet ou achetez votre premier billet pour remplir le vault.",
          openPass: "Ouvrir le pass",
          manageResale: "Gerer la revente",
          viewCollectible: "Voir le collectible",
          watch: "Suivre",
          unwatch: "Ne plus suivre",
          refresh: "Rafraichir le vault",
          walletConnected: "Wallet connecte",
          walletRequired: "Wallet requis",
          owned: "Detenus",
          listed: "En revente",
          used: "Utilises",
          collectibleLive: "Collectible actif",
          collectibleReady: "Collectible pret",
          indexedTitle: "Enrichissements indexes en attente",
          indexedImpact: "Les passes restent visibles en lecture directe on-chain pendant que la timeline enrichie et les analytics se remettent a jour.",
          mintFirst: "Acheter un premier billet",
          vaultEyebrow: "Ticket Vault",
          vaultSummary:
            "Le vault met le billet au centre du produit: statut, preuve, perks, collectible et action principale s'alignent dans la meme carte.",
          passesLabel: "Pass",
          statusLabel: "Statut",
          primaryActionLabel: "Action principale",
          qrReady: "QR pret",
          collectiblePreview: "Apercu collectible",
          tokenLabel: "Token",
          notListed: "Non liste",
          digitalPass: "Pass digital",
          admissionPass: "Pass admission",
          tableToken: "Token",
          tablePass: "Pass",
          tableListing: "Annonce",
          tableAction: "Action principale",
          tableWatch: "Suivi",
          vaultView: "Vault",
        }
      : {
          title: "Ticket Vault",
          subtitle:
            "The vault replaces the simple list: every pass reads like a premium credential with clear status, QR readiness, perks, and collectible upside.",
          inventoryTitle: "Your passes",
          inventorySubtitle: "More premium pass cards with one primary action per state.",
          emptyTitle: "No passes in this wallet",
          emptyDescription: "Connect a wallet or mint your first ticket to populate the vault.",
          openPass: "Open pass",
          manageResale: "Manage resale",
          viewCollectible: "View collectible",
          watch: "Watch",
          unwatch: "Unwatch",
          refresh: "Refresh vault",
          walletConnected: "Wallet connected",
          walletRequired: "Wallet required",
          owned: "Owned",
          listed: "Listed",
          used: "Used",
          collectibleLive: "Collectible live",
          collectibleReady: "Collectible ready",
          indexedTitle: "Indexed enrichments delayed",
          indexedImpact: "Passes still load from direct chain reads while richer lifecycle and analytics views catch up.",
          mintFirst: "Mint first ticket",
          vaultEyebrow: "Ticket Vault",
          vaultSummary:
            "The vault treats the pass as the emotional core of the product: status, proof, perks, collectible mode, and the primary action all align in the same card.",
          passesLabel: "Pass",
          statusLabel: "Status",
          primaryActionLabel: "Primary action",
          qrReady: "QR ready",
          collectiblePreview: "Collectible preview",
          tokenLabel: "Token",
          notListed: "Not listed",
          digitalPass: "Digital pass",
          admissionPass: "Admission pass",
          tableToken: "Token",
          tablePass: "Pass",
          tableListing: "Listing",
          tableAction: "Primary action",
          tableWatch: "Watch",
          vaultView: "Vault",
        };

  const sortedTickets = useMemo(
    () => [...tickets].sort((left, right) => (left.tokenId > right.tokenId ? -1 : 1)),
    [tickets],
  );

  const ticketCounters = useMemo(() => {
    let owned = 0;
    let used = 0;
    let listed = 0;
    let collectible = 0;

    for (const ticket of sortedTickets) {
      if (ticket.used) {
        used += 1;
      } else {
        owned += 1;
      }
      if (ticket.listed) {
        listed += 1;
      }
      if (ticket.used && systemState?.collectibleMode) {
        collectible += 1;
      }
    }

    return { owned, used, listed, collectible };
  }, [sortedTickets, systemState?.collectibleMode]);

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
        title={copy.title}
        subtitle={copy.subtitle}
        workspace="tickets"
        context={
          <div className="inline-actions">
            <Badge tone={walletAddress ? "success" : "warning"} emphasis="solid">
              {walletAddress ? copy.walletConnected : copy.walletRequired}
            </Badge>
            <Tag tone="success">{`${copy.owned} ${ticketCounters.owned}`}</Tag>
            <Tag tone="warning">{`${copy.listed} ${ticketCounters.listed}`}</Tag>
            <Tag tone="info">{`${copy.used} ${ticketCounters.used}`}</Tag>
            <Tag tone={systemState?.collectibleMode ? "info" : "default"}>
              {systemState?.collectibleMode ? copy.collectibleLive : copy.collectibleReady}
            </Tag>
          </div>
        }
        primaryAction={
          <button type="button" className="ghost" onClick={() => void refreshDashboard()}>
            {copy.refresh}
          </button>
        }
        secondaryActions={
          <SegmentedToggle<TicketViewMode>
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "card", label: copy.vaultView },
              { value: "table", label: "Table" },
            ]}
            ariaLabel="Ticket inventory view mode"
          />
        }
      />

      <EventDemoNotice event={selectedEvent} />

      {!walletAddress ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          action={
            <button type="button" className="primary" onClick={() => void connectWallet()}>
              {t("connectWallet")}
            </button>
          }
        />
      ) : null}

      {walletAddress && !indexedReadsAvailable ? (
        <IndexedReadinessBanner
          title={copy.indexedTitle}
          impact={copy.indexedImpact}
        />
      ) : null}

      {walletAddress && indexedReadsAvailable && sortedTickets.length === 0 ? (
        <EmptyState
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          action={
            <Link to="/app/explore" className="button-link primary">
              {copy.mintFirst}
            </Link>
          }
        />
      ) : null}

      {walletAddress && sortedTickets.length > 0 ? (
        <Panel className="vault-summary-panel" surface="glass">
          <div className="vault-summary-copy">
            <p className="eyebrow">{copy.vaultEyebrow}</p>
            <h2>{selectedEventName || contractConfig.eventName || "ChainTicket passes"}</h2>
            <p>{copy.vaultSummary}</p>
          </div>
          <div className="vault-stat-grid">
            <Card className="vault-stat-card" surface="accent">
              <span>{copy.owned}</span>
              <strong>{ticketCounters.owned}</strong>
            </Card>
            <Card className="vault-stat-card" surface="glass">
              <span>{copy.listed}</span>
              <strong>{ticketCounters.listed}</strong>
            </Card>
            <Card className="vault-stat-card" surface="glass">
              <span>Collectible</span>
              <strong>{ticketCounters.collectible}</strong>
            </Card>
          </div>
        </Panel>
      ) : null}

      {walletAddress && sortedTickets.length > 0 ? (
        <SectionHeader
          title={copy.inventoryTitle}
          subtitle={copy.inventorySubtitle}
          actions={<Tag tone="info">{sortedTickets.length.toString()}</Tag>}
        />
      ) : null}

      {walletAddress && sortedTickets.length > 0 && viewMode === "card" ? (
        <section className="ticket-pass-grid">
          {sortedTickets.map((ticket) => {
            const preview = previews.get(ticket.tokenId.toString());
            const activeMetadata = preview?.activeMetadata;
            const activeMedia = preview?.activeMedia;
            const collectibleReady = Boolean(preview?.collectibleTokenUri) && !systemState?.collectibleMode;
            const stateLabel = getTicketStateLabel({
              locale,
              ticket,
              collectibleMode: Boolean(systemState?.collectibleMode),
              collectibleReady,
            });
            const primaryAction =
              ticket.used && (collectibleReady || Boolean(systemState?.collectibleMode))
                ? {
                    to: `/app/tickets/${ticket.tokenId.toString()}?view=collectible`,
                    label: copy.viewCollectible,
                  }
                : ticket.listed
                  ? { to: "/app/marketplace", label: copy.manageResale }
                  : { to: `/app/tickets/${ticket.tokenId.toString()}`, label: copy.openPass };
            const timelineSteps = [
              { label: copy.owned, status: "done" as const },
              {
                label: copy.listed,
                status: ticket.listed ? ("done" as const) : ("upcoming" as const),
              },
              {
                label: copy.used,
                status: ticket.used ? ("done" as const) : ("active" as const),
              },
              {
                label: "Collectible",
                status:
                  ticket.used && (collectibleReady || Boolean(systemState?.collectibleMode))
                    ? ("done" as const)
                    : ("upcoming" as const),
              },
            ];

            return (
              <Card key={ticket.tokenId.toString()} className="ticket-pass-card vault-pass-card" surface="accent">
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
                    <Tag tone={ticket.used ? "warning" : ticket.listed ? "info" : "success"}>{stateLabel}</Tag>
                  </div>
                </div>

                  <div className="ticket-pass-copy">
                  <div className="ticket-pass-heading">
                    <div>
                      <p className="ticket-pass-kicker">{copy.digitalPass}</p>
                      <h3>{activeMetadata?.name ?? `${copy.admissionPass} #${ticket.tokenId.toString()}`}</h3>
                    </div>
                    <Badge tone={ticket.used ? "warning" : ticket.listed ? "info" : "success"} emphasis="solid">
                      {stateLabel}
                    </Badge>
                  </div>

                  <p className="ticket-pass-description">
                    {activeMetadata?.description ??
                      "Ownership, check-in status, resale state, and collectible upside all stay readable from the vault."}
                  </p>

                  <div className="ticket-pass-meta">
                    <span>{`${copy.tokenLabel} #${ticket.tokenId.toString()}`}</span>
                    <span>{formatAddress(ticket.owner)}</span>
                    <span>{ticket.listed ? `${formatPol(ticket.listingPrice ?? 0n)} POL` : copy.notListed}</span>
                  </div>

                  <ProgressStepper steps={timelineSteps} className="vault-lifecycle-stepper" />

                  <div className="ticket-pass-attribute-row">
                    <Tag tone="info">{copy.qrReady}</Tag>
                    {collectibleReady ? <Tag tone="success">{copy.collectiblePreview}</Tag> : null}
                    {getTicketPerks(locale).map((perk) => (
                      <Tag key={`${ticket.tokenId.toString()}-${perk}`} tone="default">
                        {perk}
                      </Tag>
                    ))}
                  </div>

                  {(activeMetadata?.attributes.length ?? 0) > 0 ? (
                    <div className="ticket-pass-attribute-grid">
                      {activeMetadata!.attributes.slice(0, 4).map((attribute) => (
                        <div
                          key={`${ticket.tokenId.toString()}-${attribute.traitType}`}
                          className="ticket-attribute-chip"
                        >
                          <span>{attribute.traitType}</span>
                          <strong>{attribute.value}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="ticket-pass-footer">
                    <Link to={primaryAction.to} className="button-link primary">
                      {primaryAction.label}
                    </Link>
                    <button type="button" className="ghost" onClick={() => toggleWatch(ticket.tokenId)}>
                      {watchlist.has(eventWatchKey(ticket.tokenId)) ? copy.unwatch : copy.watch}
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </section>
      ) : walletAddress && sortedTickets.length > 0 ? (
        <Panel className="tickets-table-panel" surface="glass">
          <table className="market-table">
            <thead>
              <tr>
                <th>{copy.tableToken}</th>
                <th>{copy.tablePass}</th>
                <th>{copy.statusLabel}</th>
                <th>{copy.tableListing}</th>
                <th>{copy.tableAction}</th>
                <th>{copy.tableWatch}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((ticket) => {
                const preview = previews.get(ticket.tokenId.toString());
                const collectibleReady = Boolean(preview?.collectibleTokenUri) && !systemState?.collectibleMode;
                const stateLabel = getTicketStateLabel({
                  locale,
                  ticket,
                  collectibleMode: Boolean(systemState?.collectibleMode),
                  collectibleReady,
                });
                const action =
                  ticket.used && (collectibleReady || Boolean(systemState?.collectibleMode))
                    ? { to: `/app/tickets/${ticket.tokenId.toString()}?view=collectible`, label: copy.viewCollectible }
                    : ticket.listed
                      ? { to: "/app/marketplace", label: copy.manageResale }
                      : { to: `/app/tickets/${ticket.tokenId.toString()}`, label: copy.openPass };

                return (
                  <tr key={ticket.tokenId.toString()}>
                    <td>#{ticket.tokenId.toString()}</td>
                    <td>{preview?.activeMetadata?.name ?? copy.admissionPass}</td>
                    <td>{stateLabel}</td>
                    <td>{ticket.listed ? `${formatPol(ticket.listingPrice ?? 0n)} POL` : "-"}</td>
                    <td>
                      <Link to={action.to} className="button-link ghost">
                        {action.label}
                      </Link>
                    </td>
                    <td>
                      <button type="button" className="ghost" onClick={() => toggleWatch(ticket.tokenId)}>
                        {watchlist.has(eventWatchKey(ticket.tokenId)) ? copy.unwatch : copy.watch}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </div>
  );
}
