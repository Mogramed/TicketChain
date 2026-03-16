import { useDeferredValue, useMemo, useState } from "react";

import {
  ActionBar,
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  EmptyState,
  InfoList,
  PageHeader,
  Panel,
  RiskBanner,
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

export function MarketPage() {
  const { t } = useI18n();
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
    uiMode,
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

  const onApproveSelected = async () => {
    const tokenId = parseTokenIdInput(selectedTokenId);
    if (tokenId === null) {
      setErrorMessage("Enter a valid tokenId.");
      return;
    }

    await preparePreview({
      label: "Approval for marketplace",
      description: "Approve marketplace for one token.",
      action: { type: "approve", tokenId },
      details: ["Owner check", "Approval simulation", "Gas estimate"],
      run: (client) => client.approveTicket(tokenId),
    });
  };

  const onListSelected = async () => {
    const tokenId = parseTokenIdInput(selectedTokenId);
    if (tokenId === null) {
      setErrorMessage("Enter a valid tokenId.");
      return;
    }

    const parsedPrice = parsePolInput(listingPriceInput);
    if (!parsedPrice.ok) {
      setErrorMessage(parsedPrice.error);
      return;
    }

    if (systemState && parsedPrice.value > systemState.primaryPrice) {
      setErrorMessage("Price exceeds primary cap.");
      return;
    }

    await preparePreview({
      label: "Create one-step listing",
      description: "Create a capped resale listing with an ERC-4494 permit.",
      action: { type: "list_with_permit", tokenId, price: parsedPrice.value },
      details: [
        "Requests one wallet signature for the permit, then submits the listing transaction.",
        "Verifies ownership without requiring a prior approval transaction.",
        "Checks cap against primary price.",
        "Runs anti-stale listing checks.",
      ],
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
      setErrorMessage("Enter a valid tokenId.");
      return;
    }

    await preparePreview({
      label: "Cancel listing",
      description: "Cancel your current resale listing.",
      action: { type: "cancel", tokenId, expectedSeller: walletAddress || undefined },
      details: ["Revalidates active listing", "Checks seller ownership", "Estimates gas"],
      run: (client) => client.cancelListing(tokenId),
    });
  };

  const onBuyListing = async (listing: MarketplaceView) => {
    await preparePreview({
      label: "Buy resale ticket",
      description: "Buy a secondary market ticket with stale-listing protection.",
      action: {
        type: "buy",
        tokenId: listing.tokenId,
        price: listing.price,
        expectedSeller: listing.seller,
      },
      details: [
        "Revalidates seller and price before signature.",
        "Checks buyer wallet cap.",
        "Shows expected ownership impact after confirmation.",
      ],
      run: (client) => client.buyTicket(listing.tokenId, listing.price),
    });
  };

  return (
    <div className="route-stack" data-testid="market-page">
      <PageHeader
        title={t("marketTitle")}
        subtitle="Secondary listing workflow with transparent filters and consistent transaction checks."
        context={
          <Tag tone="info">{filteredListings.length} active listing(s)</Tag>
        }
        primaryAction={
          <button type="button" className="primary" onClick={() => void onListSelected()}>
            Start listing
          </button>
        }
        secondaryActions={
          <ButtonGroup>
            <button
              type="button"
              className="ghost"
              disabled={!marketStats?.suggestedListPrice}
              onClick={() => {
                if (!marketStats?.suggestedListPrice) {
                  return;
                }
                setListingPriceInput(formatPol(marketStats.suggestedListPrice, 6));
              }}
            >
              {t("useSuggestedPrice")}
            </button>
          </ButtonGroup>
        }
      />

      <EventDemoNotice event={selectedEvent} />

      <Panel className="primary-panel">
        <ActionBar
          className="market-action-bar"
          primary={
            <label>
              Search listing
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="tokenId or seller"
              />
            </label>
          }
          secondary={
            <SegmentedToggle<MarketViewMode>
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "card", label: "Card" },
                { value: "table", label: "Table" },
              ]}
            />
          }
        />

        <Card className="market-listing-card">
          <h3>Create or update a listing</h3>
          <p>Use the one-step permit flow to sign listing authority off-chain, then submit the on-chain listing.</p>
          <section className="market-form">
            <label>
              {t("tokenId")}
              <input
                value={selectedTokenId}
                onChange={(event) => setSelectedTokenId(event.target.value)}
                placeholder="e.g. 12"
                inputMode="numeric"
              />
            </label>
            <label>
              {t("listingPricePol")}
              <input
                value={listingPriceInput}
                onChange={(event) => setListingPriceInput(event.target.value)}
                placeholder="e.g. 0.08"
              />
            </label>
          </section>

          <InfoList
            entries={[
              {
                label: "Selected ticket",
                value:
                  selectedOwnedTicket === null
                    ? selectedToken === null
                      ? "Choose one of your tickets to start."
                      : "Ticket not found in your wallet view."
                    : `#${selectedOwnedTicket.tokenId.toString()}`,
              },
              {
                label: "Ticket state",
                value:
                  selectedOwnedTicket === null
                    ? "-"
                    : selectedOwnedTicket.used
                      ? "Already used"
                      : selectedOwnedTicket.listed
                        ? "Already listed"
                        : "Ready for approval or listing",
              },
              {
                label: "Recommended next step",
                value:
                  "Use one-step listing for the default flow, or keep manual approval as a fallback for strict wallets.",
              },
            ]}
          />

          <ButtonGroup>
            <button type="button" className="ghost" onClick={() => void onApproveSelected()}>
              Manual approval
            </button>
            <button type="button" className="primary" onClick={() => void onListSelected()}>
              One-step listing
            </button>
            <button type="button" className="ghost" onClick={() => void onCancelSelected()}>
              {t("cancelListing")}
            </button>
          </ButtonGroup>
        </Card>

        <DetailAccordion
          title="Market filters and trust"
          subtitle="Sort, filter, and verify pricing signals"
          defaultOpenDesktop={uiMode === "advanced"}
        >
          <section className="market-toolbar-grid">
            <label>
              Sort
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as MarketSortMode)}>
                <option value="price_asc">Price asc</option>
                <option value="price_desc">Price desc</option>
                <option value="recent">Most recent</option>
              </select>
            </label>
            <label>
              Filter
              <select
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value as MarketFilterMode)}
              >
                <option value="all">All</option>
                <option value="mine">My listings</option>
                <option value="open">Open listings</option>
              </select>
            </label>
          </section>

          <InfoList
            entries={[
              {
                label: t("floorPrice"),
                value: marketStats?.floorPrice ? `${formatPol(marketStats.floorPrice)} POL` : "-",
              },
              {
                label: t("medianPrice"),
                value: marketStats?.medianPrice ? `${formatPol(marketStats.medianPrice)} POL` : "-",
              },
              {
                label: t("marketCapPrimary"),
                value: systemState?.primaryPrice ? `${formatPol(systemState.primaryPrice)} POL` : "-",
              },
              {
                label: t("marketPrecheckValidation"),
                value: marketPreflight
                  ? marketPreflight.ok
                    ? t("preflightPassed")
                    : t("preflightBlocked", { reasons: marketPreflight.blockers.join(" | ") })
                  : t("marketPrecheckPending"),
              },
            ]}
          />
        </DetailAccordion>
      </Panel>

      {!walletAddress ? (
        <RiskBanner
          tone="warning"
          title={t("emptyWalletTitle")}
          cause={t("emptyWalletMarketCause")}
          impact={t("emptyWalletMarketImpact")}
          action={t("emptyWalletMarketAction")}
        />
      ) : null}

      {!indexedReadsAvailable ? (
        <IndexedReadinessBanner />
      ) : null}

      {indexedReadsAvailable && filteredListings.length === 0 ? (
        <EmptyState
          title={t("emptyListingsTitle")}
          description={t("emptyListingsReason")}
          action={
            <button type="button" className="ghost" onClick={() => setFilterMode("all")}>
              {t("emptyListingsAction")}
            </button>
          }
        />
      ) : null}

      {indexedReadsAvailable && filteredListings.length > 0 ? (
        <SectionHeader
          title={t("marketAvailableListings")}
          subtitle={t("marketAvailableListingsSubtitle")}
          actions={<Tag tone="info">{filteredListings.length.toString()}</Tag>}
        />
      ) : null}

      {indexedReadsAvailable && viewMode === "card" ? (
        <section className="listing-grid">
          {filteredListings.map((listing) => (
            <Card key={listing.tokenId.toString()} className="listing-card live-card">
              <header className="listing-head">
                <h3>#{listing.tokenId.toString()}</h3>
                <Badge tone={listingIsMine(listing, walletAddress) ? "warning" : "success"}>
                  {listingIsMine(listing, walletAddress) ? "Owned by you" : "Open listing"}
                </Badge>
              </header>
              <p>
                Seller: <strong>{formatAddress(listing.seller)}</strong>
              </p>
              <p>
                Price: <strong>{formatPol(listing.price)} POL</strong>
              </p>
              <ButtonGroup>
                <button
                  type="button"
                  className={listingIsMine(listing, walletAddress) ? "ghost" : "primary"}
                  onClick={() => void onBuyListing(listing)}
                  disabled={listingIsMine(listing, walletAddress)}
                >
                  {listingIsMine(listing, walletAddress) ? t("yourListing") : t("buySecondary")}
                </button>
                <button type="button" className="ghost" onClick={() => toggleWatch(listing.tokenId)}>
                  {watchlist.has(eventWatchKey(listing.tokenId)) ? t("unwatch") : t("watch")}
                </button>
              </ButtonGroup>
            </Card>
          ))}
        </section>
      ) : indexedReadsAvailable ? (
        <Panel className="market-table-panel">
          <table className="market-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Seller</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredListings.map((listing) => (
                <tr key={listing.tokenId.toString()}>
                  <td>#{listing.tokenId.toString()}</td>
                  <td>{formatAddress(listing.seller)}</td>
                  <td>{formatPol(listing.price)} POL</td>
                  <td>{listingIsMine(listing, walletAddress) ? "Owned by you" : "Open listing"}</td>
                  <td>
                    <ButtonGroup>
                      <button
                        type="button"
                        className={listingIsMine(listing, walletAddress) ? "ghost" : "primary"}
                        onClick={() => void onBuyListing(listing)}
                        disabled={listingIsMine(listing, walletAddress)}
                      >
                        {listingIsMine(listing, walletAddress) ? t("yourListing") : t("buySecondary")}
                      </button>
                      <button type="button" className="ghost" onClick={() => toggleWatch(listing.tokenId)}>
                        {watchlist.has(eventWatchKey(listing.tokenId)) ? t("unwatch") : t("watch")}
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
