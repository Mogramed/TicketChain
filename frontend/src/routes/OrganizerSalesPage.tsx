import {
  Badge,
  Card,
  EmptyState,
  InfoList,
  PageHeader,
  Panel,
  SectionHeader,
  Tag,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { formatPol } from "../lib/format";
import { useAppState } from "../state/useAppState";

function percentageDelta(primaryPrice: bigint | null, resalePrice: bigint | null): string {
  if (!primaryPrice || !resalePrice || primaryPrice === 0n) {
    return "-";
  }

  const deltaBasisPoints = ((resalePrice - primaryPrice) * 10_000n) / primaryPrice;
  const sign = deltaBasisPoints > 0n ? "+" : "";
  const whole = Number(deltaBasisPoints) / 100;
  return `${sign}${whole.toFixed(1)}%`;
}

export function OrganizerSalesPage() {
  const { locale } = useI18n();
  const { listings, marketStats, systemState, indexedReadsAvailable } = useAppState();

  const copy =
    locale === "fr"
      ? {
          title: "Ventes & revente",
          subtitle: "Vue read-only des signaux de marche et de la discipline de prix autour de l'evenement selectionne.",
          listingTitle: "Annonces actives",
          listingSubtitle: "Le cockpit ops garde la lecture des volumes et de la discipline secondaire dans un espace dedie.",
          emptyTitle: "Aucune annonce indexee pour le moment",
          emptyDescription: "Cette surface devient utile des que les annonces et les stats marche sont indexees.",
          indexed: "Indexe",
          fallback: "Fallback",
          primaryPrice: "Prix primaire",
          floor: "Floor",
          median: "Mediane",
          avgVsPrimary: "Moyenne vs primaire",
          seller: "Vendeur",
          price: "Prix",
          vsPrimary: "Vs primaire",
          health: "Sante",
          watch: "A surveiller",
          healthy: "Sain",
          listingCount: "Nombre d'annonces",
          suggestedPrice: "Prix suggere",
          maxPrice: "Prix visible max",
        }
      : {
          title: "Sales & resale",
          subtitle: "Read-only view of market signals and pricing discipline around the selected event.",
          listingTitle: "Active listings",
          listingSubtitle: "The ops cockpit keeps volume and secondary discipline in a dedicated surface.",
          emptyTitle: "No indexed listings yet",
          emptyDescription: "This surface becomes useful as soon as listings and market stats are indexed.",
          indexed: "Indexed",
          fallback: "Fallback",
          primaryPrice: "Primary price",
          floor: "Floor",
          median: "Median",
          avgVsPrimary: "Avg vs primary",
          seller: "Seller",
          price: "Price",
          vsPrimary: "Vs primary",
          health: "Health",
          watch: "Watch",
          healthy: "Healthy",
          listingCount: "Listing count",
          suggestedPrice: "Suggested list price",
          maxPrice: "Highest visible price",
        };

  const primaryPrice = systemState?.primaryPrice ?? null;

  return (
    <div className="route-stack organizer-sales-route" data-testid="organizer-sales-page">
      <PageHeader
        title={copy.title}
        subtitle={copy.subtitle}
        workspace="organizer"
        context={
          <div className="inline-actions">
            <Tag tone={indexedReadsAvailable ? "success" : "warning"}>
              {indexedReadsAvailable ? copy.indexed : copy.fallback}
            </Tag>
            <Tag tone="info">{listings.length} listing(s)</Tag>
          </div>
        }
      />

      <section className="ops-metric-grid">
        <Card className="ops-metric-card" surface="accent">
          <span>{copy.primaryPrice}</span>
          <strong>{primaryPrice ? `${formatPol(primaryPrice)} POL` : "-"}</strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.floor}</span>
          <strong>
            {marketStats?.floorPrice !== null && marketStats?.floorPrice !== undefined
              ? `${formatPol(marketStats.floorPrice)} POL`
              : "-"}
          </strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.median}</span>
          <strong>
            {marketStats?.medianPrice !== null && marketStats?.medianPrice !== undefined
              ? `${formatPol(marketStats.medianPrice)} POL`
              : "-"}
          </strong>
        </Card>
        <Card className="ops-metric-card" surface="glass">
          <span>{copy.avgVsPrimary}</span>
          <strong>{percentageDelta(primaryPrice, marketStats?.averagePrice ?? null)}</strong>
        </Card>
      </section>

      <Panel className="ops-sales-panel" surface="glass">
        <SectionHeader title={copy.listingTitle} subtitle={copy.listingSubtitle} />
        {!indexedReadsAvailable && listings.length === 0 ? (
          <EmptyState title={copy.emptyTitle} description={copy.emptyDescription} />
        ) : null}

        {listings.length > 0 ? (
          <table className="market-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>{copy.seller}</th>
                <th>{copy.price}</th>
                <th>{copy.vsPrimary}</th>
                <th>{copy.health}</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => (
                <tr key={listing.tokenId.toString()}>
                  <td>#{listing.tokenId.toString()}</td>
                  <td>{listing.seller}</td>
                  <td>{formatPol(listing.price)} POL</td>
                  <td>{percentageDelta(primaryPrice, listing.price)}</td>
                  <td>
                    <Badge tone={primaryPrice && listing.price > primaryPrice ? "warning" : "success"}>
                      {primaryPrice && listing.price > primaryPrice ? copy.watch : copy.healthy}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Panel>

      <Panel surface="glass">
        <InfoList
          entries={[
            {
              label: copy.listingCount,
              value: marketStats?.listingCount ?? listings.length,
            },
            {
              label: copy.suggestedPrice,
              value:
                marketStats?.suggestedListPrice !== null && marketStats?.suggestedListPrice !== undefined
                  ? `${formatPol(marketStats.suggestedListPrice)} POL`
                  : "-",
            },
            {
              label: copy.maxPrice,
              value:
                marketStats?.maxPrice !== null && marketStats?.maxPrice !== undefined
                  ? `${formatPol(marketStats.maxPrice)} POL`
                  : "-",
            },
          ]}
        />
      </Panel>
    </div>
  );
}
