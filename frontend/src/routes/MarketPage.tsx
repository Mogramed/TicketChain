import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  ActionBar,
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
import { IndexedReadinessBanner } from "../components/layout/IndexedReadinessBanner";
import { useI18n } from "../i18n/I18nContext";
import { formatAddress, formatPol, parsePolInput } from "../lib/format";
import { parseTokenIdInput } from "../lib/timeline";
import { useAppState } from "../state/useAppState";
import type { MarketplaceView } from "../types/chainticket";

type MarketViewMode = "card" | "table";
type MarketFilterMode = "all" | "mine" | "open";
type MarketSortMode = "price_asc" | "price_desc" | "recent";

function listingIsMine(listing: MarketplaceView, walletAddress: string): boolean {
  return walletAddress.length > 0 && listing.seller.toLowerCase() === walletAddress.toLowerCase();
}

function minBigInt(left: bigint | null, right: bigint | null): bigint | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return left < right ? left : right;
}

export function MarketPage() {
  const { locale } = useI18n();
  const {
    listings,
    marketStats,
    walletAddress,
    contractConfig,
    systemState,
    tickets,
    preparePreview,
    setErrorMessage,
    watchlist,
    toggleWatch,
    pendingPreview,
    indexedReadsAvailable,
    availableEvents,
    selectedEventId,
  } = useAppState();
  const selectedEvent =
    availableEvents.find((event) => event.ticketEventId === selectedEventId) ?? null;
  const eventWatchKey = (tokenId: bigint) =>
    `${contractConfig.eventId ?? "main-event"}:${tokenId.toString()}`;

  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [listingPriceInput, setListingPriceInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [viewMode, setViewMode] = useState<MarketViewMode>("card");
  const [filterMode, setFilterMode] = useState<MarketFilterMode>("all");
  const [sortMode, setSortMode] = useState<MarketSortMode>("price_asc");
  const deferredSearchInput = useDeferredValue(searchInput);
  const deferredListings = useDeferredValue(listings);

  const copy =
    locale === "fr"
      ? {
          title: "Official Resale Market",
          subtitle:
            "Un workspace plus dense et plus lisible pour la revente officielle: prix plancher, fair range, primaire vs secondaire et creation de listing sans ambiguite.",
          primaryBridge: "Le primaire vit sur la page evenement",
          primaryBridgeBody:
            "Le primaire convertit depuis le detail evenement. Le marketplace reste concentre sur la lecture du marche secondaire et les actions de revente.",
          goEvent: "Ouvrir le detail evenement",
          startListing: "Commencer une mise en vente",
          listingTitle: "Creer ou mettre a jour une annonce",
          listingBody:
            "Le flow one-step conserve la logique permit existante, mais la surface explique maintenant clairement quand vous vendez, a quel prix, et sous quelle discipline.",
          searchLabel: "Rechercher une annonce",
          filtersTitle: "Signaux du marche",
          filtersSubtitle: "Le marche secondaire doit sembler propre, pas opaque.",
          fairRange: "Zone de prix juste",
          activeTitle: "Inventaire de revente live",
          activeSubtitle: "Annonces actives avec lecture immediate du prix et du statut.",
          emptyTitle: "Aucune annonce visible",
          emptyDescription: "Soit le marche est vide, soit les filtres actuels cachent l'inventaire disponible.",
          myTickets: "My Tickets",
          listingsCount: "annonce(s)",
          capMissing: "Cap indisponible",
          floor: "Floor",
          median: "Mediane",
          primaryCap: "Cap primaire",
          cardView: "Cartes",
          tableView: "Tableau",
          searchPlaceholder: "tokenId ou vendeur",
          tokenLabel: "Token ID",
          priceLabel: "Prix de vente (POL)",
          approvalButton: "Approbation manuelle",
          oneStepButton: "Mise en vente one-step",
          cancelButton: "Annuler l'annonce",
          sortLabel: "Tri",
          filterLabel: "Filtre",
          sortPriceAsc: "Prix croissant",
          sortPriceDesc: "Prix decroissant",
          sortRecent: "Plus recent",
          filterAll: "Tout",
          filterMine: "Mes annonces",
          filterOpen: "Annonces ouvertes",
          selectedTicket: "Billet selectionne",
          ticketMissing: "Billet introuvable dans votre vue wallet.",
          ticketPrompt: "Choisissez l'un de vos billets pour commencer.",
          ticketState: "Etat du billet",
          alreadyUsed: "Deja utilise",
          alreadyListed: "Deja en vente",
          readyForResale: "Pret pour la revente",
          livePrecheck: "Pre-check live",
          precheckPrompt: "Lancez une action marche pour voir un pre-check frais.",
          safeToSign: "Pret a signer.",
          connectWallet: "Connectez un wallet pour signer un achat ou publier une annonce.",
          ownedByYou: "A vous",
          openListing: "Annonce ouverte",
          sellerPrefix: "Vendeur",
          capPending: "Cap en attente",
          fairPending: "Zone juste en attente",
          aboveCap: "Au-dessus du cap",
          withinCap: "Dans le cap",
          yourListing: "Votre annonce",
          buyResale: "Acheter en revente",
          tokenHeader: "Token",
          sellerHeader: "Vendeur",
          priceHeader: "Prix",
          fairHeader: "Zone juste",
          statusHeader: "Statut",
          actionsHeader: "Actions",
          invalidToken: "Entrez un tokenId valide.",
          priceCapExceeded: "Le prix depasse le cap primaire.",
          approvePreviewLabel: "Approbation marketplace",
          approvePreviewDescription: "Approuver le marketplace pour un token.",
          approvePreviewDetails: ["Verification proprietaire", "Simulation approval", "Estimation gas"],
          listPreviewLabel: "Creer une annonce one-step",
          listPreviewDescription: "Creer une annonce secondaire plafonnee avec un permit ERC-4494.",
          listPreviewDetails: [
            "Demande une seule signature wallet pour le permit, puis soumet la transaction de listing.",
            "Verifie la propriete sans exiger une transaction d'approbation prealable.",
            "Controle le cap par rapport au prix primaire.",
            "Lance les verifications anti-etat-obsolete.",
          ],
          cancelPreviewLabel: "Annuler l'annonce",
          cancelPreviewDescription: "Annuler votre annonce secondaire actuelle.",
          cancelPreviewDetails: ["Revalide l'annonce active", "Controle le vendeur", "Estime le gas"],
          buyPreviewLabel: "Acheter un billet en revente",
          buyPreviewDescription: "Acheter un billet secondaire avec protection contre les listings obsoletes.",
          buyPreviewDetails: [
            "Revalide vendeur et prix avant signature.",
            "Controle le cap wallet acheteur.",
            "Affiche l'impact de propriete attendu apres confirmation.",
          ],
        }
      : {
          title: "Official Resale Market",
          subtitle:
            "A denser, clearer resale workspace for official secondary inventory: floor price, fair range, primary vs secondary, and clean listing creation.",
          primaryBridge: "Primary stays on the event page",
          primaryBridgeBody:
            "Primary purchase converts from event detail. Marketplace stays focused on reading secondary market health and performing resale actions.",
          goEvent: "Open event detail",
          startListing: "Start listing",
          listingTitle: "Create or update listing",
          listingBody:
            "The one-step flow keeps the existing permit logic, but the surface now explains exactly when you sell, at what price, and under which discipline.",
          searchLabel: "Search listing",
          filtersTitle: "Market signal",
          filtersSubtitle: "The secondary market should read clean, not opaque.",
          fairRange: "Fair price range",
          activeTitle: "Live resale inventory",
          activeSubtitle: "Active listings with immediate reading of price and status.",
          emptyTitle: "No visible listings",
          emptyDescription: "Either the market is empty or the current filters are hiding the current inventory.",
          myTickets: "My Tickets",
          listingsCount: "listing(s)",
          capMissing: "No cap data",
          floor: "Floor",
          median: "Median",
          primaryCap: "Primary cap",
          cardView: "Cards",
          tableView: "Table",
          searchPlaceholder: "tokenId or seller",
          tokenLabel: "Token ID",
          priceLabel: "Listing Price (POL)",
          approvalButton: "Manual approval",
          oneStepButton: "One-step listing",
          cancelButton: "Cancel listing",
          sortLabel: "Sort",
          filterLabel: "Filter",
          sortPriceAsc: "Price asc",
          sortPriceDesc: "Price desc",
          sortRecent: "Most recent",
          filterAll: "All",
          filterMine: "My listings",
          filterOpen: "Open listings",
          selectedTicket: "Selected ticket",
          ticketMissing: "Ticket not found in your wallet view.",
          ticketPrompt: "Choose one of your tickets to start.",
          ticketState: "Ticket state",
          alreadyUsed: "Already used",
          alreadyListed: "Already listed",
          readyForResale: "Ready for resale",
          livePrecheck: "Live pre-check",
          precheckPrompt: "Run a market action to see a fresh pre-check.",
          safeToSign: "Safe to sign.",
          connectWallet: "Connect a wallet to sign a purchase or publish a listing.",
          ownedByYou: "Owned by you",
          openListing: "Open listing",
          sellerPrefix: "Seller",
          capPending: "Cap pending",
          fairPending: "Fair range pending",
          aboveCap: "Above cap",
          withinCap: "Within cap",
          yourListing: "Your listing",
          buyResale: "Buy resale",
          tokenHeader: "Token",
          sellerHeader: "Seller",
          priceHeader: "Price",
          fairHeader: "Fair range",
          statusHeader: "Status",
          actionsHeader: "Actions",
          invalidToken: "Enter a valid tokenId.",
          priceCapExceeded: "Price exceeds primary cap.",
          approvePreviewLabel: "Approval for marketplace",
          approvePreviewDescription: "Approve marketplace for one token.",
          approvePreviewDetails: ["Owner check", "Approval simulation", "Gas estimate"],
          listPreviewLabel: "Create one-step listing",
          listPreviewDescription: "Create a capped resale listing with an ERC-4494 permit.",
          listPreviewDetails: [
            "Requests one wallet signature for the permit, then submits the listing transaction.",
            "Verifies ownership without requiring a prior approval transaction.",
            "Checks cap against primary price.",
            "Runs anti-stale listing checks.",
          ],
          cancelPreviewLabel: "Cancel listing",
          cancelPreviewDescription: "Cancel your current resale listing.",
          cancelPreviewDetails: ["Revalidates active listing", "Checks seller ownership", "Estimates gas"],
          buyPreviewLabel: "Buy resale ticket",
          buyPreviewDescription: "Buy a secondary market ticket with stale-listing protection.",
          buyPreviewDetails: [
            "Revalidates seller and price before signature.",
            "Checks buyer wallet cap.",
            "Shows expected ownership impact after confirmation.",
          ],
        };

  const selectedToken = useMemo(() => parseTokenIdInput(selectedTokenId), [selectedTokenId]);
  const selectedOwnedTicket = useMemo(
    () =>
      selectedToken === null
        ? null
        : tickets.find((ticket) => ticket.tokenId === selectedToken) ?? null,
    [selectedToken, tickets],
  );

  const filteredListings = useMemo(() => {
    const normalizedSearch = deferredSearchInput.trim().toLowerCase();

    const byFilters = deferredListings.filter((listing) => {
      if (filterMode === "mine" && !listingIsMine(listing, walletAddress)) {
        return false;
      }
      if (filterMode === "open" && listingIsMine(listing, walletAddress)) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }

      return (
        listing.tokenId.toString().includes(normalizedSearch) ||
        listing.seller.toLowerCase().includes(normalizedSearch)
      );
    });

    return byFilters.sort((left, right) => {
      if (sortMode === "price_desc") {
        return left.price > right.price ? -1 : left.price < right.price ? 1 : 0;
      }
      if (sortMode === "recent") {
        return left.tokenId > right.tokenId ? -1 : left.tokenId < right.tokenId ? 1 : 0;
      }
      return left.price < right.price ? -1 : left.price > right.price ? 1 : 0;
    });
  }, [deferredListings, deferredSearchInput, filterMode, sortMode, walletAddress]);

  const marketPreflight = useMemo(() => {
    if (!pendingPreview?.action) {
      return null;
    }
    if (
      pendingPreview.action.type !== "approve" &&
      pendingPreview.action.type !== "list" &&
      pendingPreview.action.type !== "list_with_permit" &&
      pendingPreview.action.type !== "cancel" &&
      pendingPreview.action.type !== "buy"
    ) {
      return null;
    }
    return pendingPreview.preflight;
  }, [pendingPreview]);

  const fairBaseline = marketStats?.medianPrice ?? marketStats?.suggestedListPrice ?? systemState?.primaryPrice ?? null;
  const fairLow = fairBaseline ? (fairBaseline * 9n) / 10n : null;
  const fairHigh = fairBaseline
    ? minBigInt((fairBaseline * 11n) / 10n, systemState?.primaryPrice ?? null)
    : null;

  const onApproveSelected = async () => {
    const tokenId = parseTokenIdInput(selectedTokenId);
    if (tokenId === null) {
      setErrorMessage(copy.invalidToken);
      return;
    }

    await preparePreview({
      label: copy.approvePreviewLabel,
      description: copy.approvePreviewDescription,
      action: { type: "approve", tokenId },
      details: copy.approvePreviewDetails,
      run: (client) => client.approveTicket(tokenId),
    });
  };

  const onListSelected = async () => {
    const tokenId = parseTokenIdInput(selectedTokenId);
    if (tokenId === null) {
      setErrorMessage(copy.invalidToken);
      return;
    }

    const parsedPrice = parsePolInput(listingPriceInput);
    if (!parsedPrice.ok) {
      setErrorMessage(parsedPrice.error);
      return;
    }

    if (systemState && parsedPrice.value > systemState.primaryPrice) {
      setErrorMessage(copy.priceCapExceeded);
      return;
    }

    await preparePreview({
      label: copy.listPreviewLabel,
      description: copy.listPreviewDescription,
      action: { type: "list_with_permit", tokenId, price: parsedPrice.value },
      details: copy.listPreviewDetails,
      run: async (client) => {
        if (!client.listTicketWithPermit) {
          throw new Error("One-step permit listing is unavailable in this wallet client.");
        }
        return client.listTicketWithPermit(tokenId, parsedPrice.value);
      },
    });
  };

  const onCancelSelected = async () => {
    const tokenId = parseTokenIdInput(selectedTokenId);
    if (tokenId === null) {
      setErrorMessage(copy.invalidToken);
      return;
    }

    await preparePreview({
      label: copy.cancelPreviewLabel,
      description: copy.cancelPreviewDescription,
      action: { type: "cancel", tokenId, expectedSeller: walletAddress || undefined },
      details: copy.cancelPreviewDetails,
      run: (client) => client.cancelListing(tokenId),
    });
  };

  const onBuyListing = async (listing: MarketplaceView) => {
    await preparePreview({
      label: copy.buyPreviewLabel,
      description: copy.buyPreviewDescription,
      action: {
        type: "buy",
        tokenId: listing.tokenId,
        price: listing.price,
        expectedSeller: listing.seller,
      },
      details: copy.buyPreviewDetails,
      run: (client) => client.buyTicket(listing.tokenId, listing.price),
    });
  };

  return (
    <div className="route-stack market-route" data-testid="market-page">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        workspace="marketplace"
        context={
          <div className="inline-actions">
            <Tag tone="success">
              {`${marketStats?.listingCount ?? filteredListings.length} ${copy.listingsCount}`}
            </Tag>
            <Tag tone="info">
              {systemState?.primaryPrice ? `${formatPol(systemState.primaryPrice)} POL cap` : copy.capMissing}
            </Tag>
          </div>
        }
        primaryAction={
          <button type="button" className="primary" onClick={() => void onListSelected()}>
            {copy.startListing}
          </button>
        }
      />

      <Panel className="market-context-panel" surface="glass">
        <Card className="market-primary-bridge" surface="quiet">
          <p className="eyebrow">{copy.primaryBridge}</p>
          <h3>{selectedEvent?.name ?? contractConfig.eventName ?? "Current event"}</h3>
          <p>{copy.primaryBridgeBody}</p>
          <ButtonGroup>
            <Link
              to={`/app/explore/${selectedEvent?.ticketEventId ?? contractConfig.eventId ?? "main-event"}`}
              className="button-link ghost"
            >
              {copy.goEvent}
            </Link>
            <Link to="/app/tickets" className="button-link ghost">
              {copy.myTickets}
            </Link>
          </ButtonGroup>
        </Card>

        <div className="market-signal-grid">
          <Card className="market-signal-card" surface="accent">
            <span>{copy.floor}</span>
            <strong>
              {marketStats?.floorPrice !== null && marketStats?.floorPrice !== undefined
                ? `${formatPol(marketStats.floorPrice)} POL`
                : "-"}
            </strong>
          </Card>
          <Card className="market-signal-card" surface="glass">
            <span>{copy.fairRange}</span>
            <strong>
              {fairLow !== null && fairHigh !== null
                ? `${formatPol(fairLow)} - ${formatPol(fairHigh)} POL`
                : "-"}
            </strong>
          </Card>
          <Card className="market-signal-card" surface="glass">
            <span>{copy.median}</span>
            <strong>
              {marketStats?.medianPrice !== null && marketStats?.medianPrice !== undefined
                ? `${formatPol(marketStats.medianPrice)} POL`
                : "-"}
            </strong>
          </Card>
          <Card className="market-signal-card" surface="glass">
            <span>{copy.primaryCap}</span>
            <strong>{systemState?.primaryPrice ? `${formatPol(systemState.primaryPrice)} POL` : "-"}</strong>
          </Card>
        </div>
      </Panel>

      <EventDemoNotice event={selectedEvent} />

      <Panel className="market-listing-shell" surface="glass">
        <ActionBar
          className="market-action-bar"
          surface="quiet"
          primary={
            <label>
              {copy.searchLabel}
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={copy.searchPlaceholder}
              />
            </label>
          }
          secondary={
            <SegmentedToggle<MarketViewMode>
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "card", label: copy.cardView },
                { value: "table", label: copy.tableView },
              ]}
            />
          }
        />

        <div className="market-builder-grid">
          <Card className="market-builder-card" surface="accent">
            <h3>{copy.listingTitle}</h3>
            <p>{copy.listingBody}</p>
            <section className="market-form">
              <label>
                {copy.tokenLabel}
                <input
                  value={selectedTokenId}
                  onChange={(event) => setSelectedTokenId(event.target.value)}
                  placeholder="e.g. 12"
                  inputMode="numeric"
                />
              </label>
              <label>
                {copy.priceLabel}
                <input
                  value={listingPriceInput}
                  onChange={(event) => setListingPriceInput(event.target.value)}
                  placeholder="e.g. 0.08"
                />
              </label>
            </section>
            <ButtonGroup>
              <button type="button" className="ghost" onClick={() => void onApproveSelected()}>
                {copy.approvalButton}
              </button>
              <button type="button" className="primary" onClick={() => void onListSelected()}>
                {copy.oneStepButton}
              </button>
              <button type="button" className="ghost" onClick={() => void onCancelSelected()}>
                {copy.cancelButton}
              </button>
            </ButtonGroup>
          </Card>

          <Card className="market-builder-card" surface="glass">
            <SectionHeader title={copy.filtersTitle} subtitle={copy.filtersSubtitle} />
            <div className="market-toolbar-grid">
              <label>
                {copy.sortLabel}
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as MarketSortMode)}>
                  <option value="price_asc">{copy.sortPriceAsc}</option>
                  <option value="price_desc">{copy.sortPriceDesc}</option>
                  <option value="recent">{copy.sortRecent}</option>
                </select>
              </label>
              <label>
                {copy.filterLabel}
                <select value={filterMode} onChange={(event) => setFilterMode(event.target.value as MarketFilterMode)}>
                  <option value="all">{copy.filterAll}</option>
                  <option value="mine">{copy.filterMine}</option>
                  <option value="open">{copy.filterOpen}</option>
                </select>
              </label>
            </div>
            <InfoList
              entries={[
                {
                  label: copy.selectedTicket,
                  value:
                    selectedOwnedTicket === null
                      ? selectedToken === null
                        ? copy.ticketPrompt
                        : copy.ticketMissing
                      : `#${selectedOwnedTicket.tokenId.toString()}`,
                },
                {
                  label: copy.ticketState,
                  value:
                    selectedOwnedTicket === null
                      ? "-"
                      : selectedOwnedTicket.used
                        ? copy.alreadyUsed
                        : selectedOwnedTicket.listed
                          ? copy.alreadyListed
                          : copy.readyForResale,
                },
                {
                  label: copy.livePrecheck,
                  value:
                    marketPreflight === null
                      ? copy.precheckPrompt
                      : marketPreflight.ok
                        ? copy.safeToSign
                        : marketPreflight.blockers.join(" | "),
                },
              ]}
            />
          </Card>
        </div>
      </Panel>

      {!walletAddress ? (
        <Panel className="market-empty-bridge" surface="glass">
          <p>{copy.connectWallet}</p>
        </Panel>
      ) : null}

      {!indexedReadsAvailable ? <IndexedReadinessBanner /> : null}

      {indexedReadsAvailable && filteredListings.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyDescription} />
      ) : null}

      {indexedReadsAvailable && filteredListings.length > 0 ? (
        <SectionHeader
          title={copy.activeTitle}
          subtitle={copy.activeSubtitle}
          actions={<Tag tone="info">{filteredListings.length.toString()}</Tag>}
        />
      ) : null}

      {indexedReadsAvailable && viewMode === "card" ? (
        <section className="listing-grid">
          {filteredListings.map((listing) => (
            <Card key={listing.tokenId.toString()} className="listing-card market-live-card" surface="glass">
              <header className="listing-head">
                <div>
                  <p className="eyebrow">Token #{listing.tokenId.toString()}</p>
                  <h3>{formatPol(listing.price)} POL</h3>
                </div>
                <Badge tone={listingIsMine(listing, walletAddress) ? "warning" : "success"}>
                  {listingIsMine(listing, walletAddress) ? copy.ownedByYou : copy.openListing}
                </Badge>
              </header>
              <p className="market-listing-meta">
                {`${copy.sellerPrefix} ${formatAddress(listing.seller)} | `}
                {systemState?.primaryPrice ? `Cap ${formatPol(systemState.primaryPrice)} POL` : copy.capPending}
              </p>
              <div className="inline-actions">
                <Tag tone="info">
                  {fairLow !== null && fairHigh !== null
                    ? `${formatPol(fairLow)} - ${formatPol(fairHigh)} POL`
                    : copy.fairPending}
                </Tag>
                <Tag tone={listing.price > (systemState?.primaryPrice ?? listing.price) ? "warning" : "success"}>
                  {listing.price > (systemState?.primaryPrice ?? listing.price) ? copy.aboveCap : copy.withinCap}
                </Tag>
              </div>
              <ButtonGroup>
                <button
                  type="button"
                  className={listingIsMine(listing, walletAddress) ? "ghost" : "primary"}
                  onClick={() => void onBuyListing(listing)}
                  disabled={listingIsMine(listing, walletAddress)}
                >
                  {listingIsMine(listing, walletAddress) ? copy.yourListing : copy.buyResale}
                </button>
                <button type="button" className="ghost" onClick={() => toggleWatch(listing.tokenId)}>
                  {watchlist.has(eventWatchKey(listing.tokenId)) ? "Unwatch" : "Watch"}
                </button>
              </ButtonGroup>
            </Card>
          ))}
        </section>
      ) : indexedReadsAvailable ? (
        <Panel className="market-table-panel" surface="glass">
          <table className="market-table">
            <thead>
              <tr>
                <th>{copy.tokenHeader}</th>
                <th>{copy.sellerHeader}</th>
                <th>{copy.priceHeader}</th>
                <th>{copy.fairHeader}</th>
                <th>{copy.statusHeader}</th>
                <th>{copy.actionsHeader}</th>
              </tr>
            </thead>
            <tbody>
              {filteredListings.map((listing) => (
                <tr key={listing.tokenId.toString()}>
                  <td>#{listing.tokenId.toString()}</td>
                  <td>{formatAddress(listing.seller)}</td>
                  <td>{formatPol(listing.price)} POL</td>
                  <td>
                    {fairLow !== null && fairHigh !== null
                      ? `${formatPol(fairLow)} - ${formatPol(fairHigh)} POL`
                      : "-"}
                  </td>
                  <td>{listingIsMine(listing, walletAddress) ? copy.ownedByYou : copy.openListing}</td>
                  <td>
                    <ButtonGroup>
                      <button
                        type="button"
                        className={listingIsMine(listing, walletAddress) ? "ghost" : "primary"}
                        onClick={() => void onBuyListing(listing)}
                        disabled={listingIsMine(listing, walletAddress)}
                      >
                        {listingIsMine(listing, walletAddress) ? copy.yourListing : copy.buyResale}
                      </button>
                      <button type="button" className="ghost" onClick={() => toggleWatch(listing.tokenId)}>
                        {watchlist.has(eventWatchKey(listing.tokenId)) ? "Unwatch" : "Watch"}
                      </button>
                    </ButtonGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
    </div>
  );
}
