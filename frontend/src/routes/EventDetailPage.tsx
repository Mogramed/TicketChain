import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { EventPoster } from "../components/events/EventPoster";
import {
  Badge,
  ButtonGroup,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  RiskBanner,
  SectionHeader,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { formatEventStart, formatPol } from "../lib/format";
import {
  getEventBenefitBadges,
  getEventDetailTabs,
  getEventTrustPoints,
} from "../lib/workspaceContent";
import { useAppState } from "../state/useAppState";
import type { EventDetailTabKey } from "../types/chainticket";

export function EventDetailPage() {
  const { locale } = useI18n();
  const { eventId } = useParams<{ eventId: string }>();
  const {
    availableEvents,
    setSelectedEventId,
    marketStats,
    systemState,
    walletAddress,
    connectWallet,
    preparePreview,
    pendingPreview,
    txState,
  } = useAppState();
  const [activeTab, setActiveTab] = useState<EventDetailTabKey>("overview");

  const event = eventId
    ? availableEvents.find((candidate) => candidate.ticketEventId === eventId) ?? null
    : availableEvents[0] ?? null;

  useEffect(() => {
    if (event) {
      setSelectedEventId(event.ticketEventId);
    }
  }, [event, setSelectedEventId]);

  const copy =
    locale === "fr"
      ? {
          title: "Detail evenement",
          subtitle:
            "La page qui convertit: gros visuel, infos essentielles immediates, bloc d'achat sticky et preuve rendue simple.",
          viewMarket: "Ouvrir le marketplace",
          mint: "Acheter en primaire",
          connect: "Connect wallet",
          buyPanelTitle: "Acces primaire",
          buyPanelBody:
            "Achetez sans quitter la page. Le pre-check et la signature restent relies au flow on-chain existant, mais l'interface raconte d'abord la valeur utilisateur.",
          whySafer: "Pourquoi ce billet rassure davantage",
          whySaferBody:
            "La couche blockchain existe pour proteger la confiance: prix plus lisible, propriete verifiable, collectible apres usage et moins de fraude terrain.",
          validity: "Billet primaire",
          statusReady: "Pret pour l'achat",
          statusBlocked: "Verifier avant achat",
          invalidTitle: "Evenement introuvable",
          invalidDescription: "L'evenement selectionne n'a pas pu etre retrouve dans le catalogue actuel.",
          backExplore: "Retour a Explore",
          txTitle: "Etat de transaction",
          txFallback: "Aucune transaction d'achat n'a encore demarre.",
          dateLabel: "Date",
          venueLabel: "Lieu",
          priceLabel: "Prix",
          walletCapLabel: "Cap wallet",
          walletRequiredTitle: "Wallet requis pour le checkout primaire",
          walletRequiredCause: "Aucune session wallet active.",
          walletRequiredImpact: "Le bloc d'achat reste en lecture seule tant que le wallet n'est pas connecte.",
          walletRequiredAction: "Connectez le wallet pour continuer.",
          mintPreviewLabel: "Achat primaire",
          mintPreviewDescription: "Acheter un billet primaire directement depuis la page evenement.",
          mintPreviewChecks: [
            "Verifie pause, supply et cap wallet avant signature.",
            "Simule localement avant d'ouvrir le wallet.",
            "Affiche un pre-check avant transaction.",
          ],
          benefitBullets: [
            "La revente reste plafonnee par design.",
            "La propriete est verifiee avant l'entree.",
            "Le collectible se revele apres usage.",
          ],
        }
      : {
          title: "Event detail",
          subtitle:
            "The page that converts: huge event visual, top-level facts, a sticky buy block, and proof made simple.",
          viewMarket: "Open marketplace",
          mint: "Mint primary ticket",
          connect: "Connect wallet",
          buyPanelTitle: "Primary access",
          buyPanelBody:
            "Buy without leaving the page. Pre-check and wallet signature still use the existing on-chain flow, but the interface leads with user value first.",
          whySafer: "Why this ticket is safer",
          whySaferBody:
            "The blockchain layer exists to protect trust: cleaner pricing, verifiable ownership, collectible upside after use, and less venue fraud.",
          validity: "Primary ticket",
          statusReady: "Ready to mint",
          statusBlocked: "Check before mint",
          invalidTitle: "Event not found",
          invalidDescription: "The selected event could not be resolved from the current catalog.",
          backExplore: "Back to Explore",
          txTitle: "Live transaction state",
          txFallback: "No purchase transaction started yet.",
          dateLabel: "Date",
          venueLabel: "Venue",
          priceLabel: "Price",
          walletCapLabel: "Wallet cap",
          walletRequiredTitle: "Wallet required for primary checkout",
          walletRequiredCause: "No active wallet session.",
          walletRequiredImpact: "The buy block stays read-only until a wallet is connected.",
          walletRequiredAction: "Connect your wallet to continue.",
          mintPreviewLabel: "Primary purchase",
          mintPreviewDescription: "Buy one primary ticket directly from the event detail page.",
          mintPreviewChecks: [
            "Checks pause, supply, and wallet cap before signature.",
            "Runs a local simulation before opening the wallet.",
            "Shows a pre-check before the transaction.",
          ],
          benefitBullets: [
            "Resale stays capped by design.",
            "Verified ownership before entry.",
            "Collectible reveal after usage.",
          ],
        };

  const mintPreflight = useMemo(() => {
    if (!pendingPreview || pendingPreview.action?.type !== "mint" || !pendingPreview.preflight) {
      return null;
    }
    return pendingPreview.preflight;
  }, [pendingPreview]);

  const benefitBadges = getEventBenefitBadges(locale);
  const trustPoints = getEventTrustPoints(locale);
  const tabs = event
    ? getEventDetailTabs({
        locale,
        event,
        systemState,
        marketStats,
      })
    : [];
  const activeTabContent = tabs.find((tab) => tab.key === activeTab) ?? tabs[0] ?? null;

  const onMint = async () => {
    await preparePreview({
      label: copy.mintPreviewLabel,
      description: copy.mintPreviewDescription,
      action: { type: "mint" },
      details: copy.mintPreviewChecks,
      run: (client) => client.mintPrimary(),
    });
  };

  if (!event) {
    return (
      <div className="route-stack event-detail-route" data-testid="event-detail-page">
        <EmptyState
          title={copy.invalidTitle}
          description={copy.invalidDescription}
          action={
            <Link to="/app/explore" className="button-link primary">
              {copy.backExplore}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="route-stack event-detail-route" data-testid="event-detail-page">
      <PageHeader
        title={event.name}
        subtitle={copy.subtitle}
        workspace="explore"
        context={
          <div className="inline-actions">
            <Tag tone="default">{event.category ?? copy.validity}</Tag>
            <Tag tone="info">{formatEventStart(event.startsAt)}</Tag>
            <Tag tone="success">{formatPol(BigInt(event.primaryPriceWei))} POL</Tag>
          </div>
        }
        primaryAction={
          <ButtonGroup>
            <Link to="/app/marketplace" className="button-link ghost">
              {copy.viewMarket}
            </Link>
          </ButtonGroup>
        }
      />

      <section className="event-detail-shell">
        <Panel className="event-detail-hero-card" surface="glass">
          <div className="event-detail-hero-media">
            <EventPoster event={event} className="event-detail-poster" />
          </div>
          <div className="event-detail-hero-copy">
            <div className="inline-actions">
              {benefitBadges.map((badge) => (
                <Tag key={badge} tone="info">
                  {badge}
                </Tag>
              ))}
            </div>
            <h2>{copy.title}</h2>
            <p>
              {[event.venueName, event.city, event.countryCode].filter(Boolean).join(" | ") || event.ticketEventId}
            </p>
            <p>
              {locale === "fr"
                ? "Les infos critiques sont visibles tout de suite: date, lieu, prix, regles de revente et promesse collectible."
                : "The critical facts are visible immediately: date, venue, price, resale rules, and collectible promise."}
            </p>
            <div className="event-detail-fact-grid">
              <Card className="event-detail-fact-card" surface="quiet">
                <span>{copy.dateLabel}</span>
                <strong>{formatEventStart(event.startsAt)}</strong>
              </Card>
              <Card className="event-detail-fact-card" surface="quiet">
                <span>{copy.venueLabel}</span>
                <strong>{event.venueName ?? event.city ?? event.ticketEventId}</strong>
              </Card>
              <Card className="event-detail-fact-card" surface="quiet">
                <span>{copy.priceLabel}</span>
                <strong>{formatPol(BigInt(event.primaryPriceWei))} POL</strong>
              </Card>
              <Card className="event-detail-fact-card" surface="quiet">
                <span>{copy.walletCapLabel}</span>
                <strong>{systemState?.maxPerWallet?.toString() ?? "-"}</strong>
              </Card>
            </div>
          </div>
        </Panel>

        <aside className="event-buy-card">
          <Panel className="event-buy-panel" surface="accent">
            <p className="eyebrow">{copy.buyPanelTitle}</p>
            <h3>{formatPol(BigInt(event.primaryPriceWei))} POL</h3>
            <p>{copy.buyPanelBody}</p>
            <Badge tone={mintPreflight?.ok ?? true ? "success" : "warning"} emphasis="solid">
              {mintPreflight ? (mintPreflight.ok ? copy.statusReady : copy.statusBlocked) : copy.statusReady}
            </Badge>
            <ButtonGroup>
              {walletAddress ? (
                <button type="button" className="primary" onClick={() => void onMint()}>
                  {copy.mint}
                </button>
              ) : (
                <button type="button" className="primary" onClick={() => void connectWallet()}>
                  {copy.connect}
                </button>
              )}
              <Link to="/app/marketplace" className="button-link ghost">
                {copy.viewMarket}
              </Link>
            </ButtonGroup>
            <ul className="event-buy-list">
              {copy.benefitBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </Panel>

          <Card className="event-buy-panel" surface="glass">
            <h3>{copy.txTitle}</h3>
            <p>{txState.label ?? copy.txFallback}</p>
            <div className="inline-actions">
              <Tag tone={txState.status === "error" ? "danger" : txState.status === "success" ? "success" : "default"}>
                {txState.status}
              </Tag>
              {txState.hash ? <Tag tone="info">{txState.hash.slice(0, 10)}</Tag> : null}
            </div>
          </Card>
        </aside>
      </section>

      <EventDemoNotice event={event} />

      {!walletAddress ? (
        <RiskBanner
          tone="warning"
          title={copy.walletRequiredTitle}
          cause={copy.walletRequiredCause}
          impact={copy.walletRequiredImpact}
          action={copy.walletRequiredAction}
        />
      ) : null}

      <section className="event-trust-shell">
        <SectionHeader title={copy.whySafer} subtitle={copy.whySaferBody} />
        <div className="event-trust-grid">
          {trustPoints.map((point) => (
            <Card key={point.title} className="event-trust-card" surface="glass">
              <h3>{point.title}</h3>
              <p>{point.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {activeTabContent ? (
        <Panel className="event-tab-shell" surface="glass">
          <SegmentedToggle<EventDetailTabKey>
            value={activeTab}
            onChange={setActiveTab}
            options={tabs.map((tab) => ({ value: tab.key, label: tab.label }))}
            ariaLabel="Event detail sections"
          />
          <Card className="event-tab-card" surface="quiet">
            <h3>{activeTabContent.title}</h3>
            <p>{activeTabContent.lead}</p>
            <ul className="plain-list">
              {activeTabContent.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </Card>
        </Panel>
      ) : null}
    </div>
  );
}
