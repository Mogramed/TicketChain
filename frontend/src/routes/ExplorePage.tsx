import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { EventPoster } from "../components/events/EventPoster";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  SectionHeader,
  Tag,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { formatEventStart, formatPol } from "../lib/format";
import { getEventBenefitBadges } from "../lib/workspaceContent";
import { useAppState } from "../state/useAppState";

function isDefinedOption(value: string | null | undefined): value is string {
  return Boolean(value);
}

export function ExplorePage() {
  const { locale } = useI18n();
  const { availableEvents, selectedEventId, setSelectedEventId } = useAppState();
  const [searchInput, setSearchInput] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const deferredSearchInput = useDeferredValue(searchInput);

  const copy =
    locale === "fr"
      ? {
          title: "Explore les experiences live",
          subtitle:
            "Une home plus editoriale pour decouvrir les evenements, comprendre la promesse ChainTicket et entrer vite dans le detail qui convertit.",
          heroTitle: "Ticketing premium, sans chaos ni jargon.",
          heroBody:
            "Explore donne envie avant de demander un effort. Les garde-fous blockchain deviennent des benefices visibles: propriete verifiable, revente plafonnee et billet qui garde de la valeur apres le show.",
          viewEvent: "Voir l'evenement",
          featured: "Evenement en avant",
          filtersTitle: "Affiner la selection",
          filtersSubtitle: "Des filtres simples pour passer vite de l'inspiration a l'intention d'achat.",
          searchLabel: "Recherche",
          searchPlaceholder: "artiste, ville, salle",
          categoryLabel: "Categorie",
          cityLabel: "Ville",
          countryLabel: "Pays",
          all: "Tout",
          upcoming: "A venir",
          noEventsTitle: "Aucun evenement ne correspond a ces filtres",
          noEventsDescription: "Reinitialisez les filtres pour rouvrir toute la selection ChainTicket.",
          reset: "Reinitialiser",
          from: "Des",
          sectionTitle: "Evenements en avant",
          sectionSubtitle: "De grandes cartes editoriales pour ressentir le show avant meme d'ouvrir le detail.",
          marketLink: "Marketplace",
          liveEvent: "Evenement live",
        }
      : {
          title: "Explore live experiences",
          subtitle:
            "A more editorial home for discovering events, understanding the ChainTicket promise, and jumping into the detail page that converts.",
          heroTitle: "Premium ticketing, minus the usual chaos.",
          heroBody:
            "Explore creates desire before asking for effort. The blockchain guardrails are reframed as visible benefits: verifiable ownership, capped resale, and a pass that keeps value after the show.",
          viewEvent: "View event",
          featured: "Featured event",
          filtersTitle: "Refine the lineup",
          filtersSubtitle: "Simple filters that move quickly from inspiration to purchase intent.",
          searchLabel: "Search",
          searchPlaceholder: "artist, city, venue",
          categoryLabel: "Category",
          cityLabel: "City",
          countryLabel: "Country",
          all: "All",
          upcoming: "Coming up",
          noEventsTitle: "No event matches these filters",
          noEventsDescription: "Reset the filters to reopen the full ChainTicket lineup.",
          reset: "Reset filters",
          from: "From",
          sectionTitle: "Featured events",
          sectionSubtitle: "Large editorial cards that let the show land before the detail page even opens.",
          marketLink: "Marketplace",
          liveEvent: "Live event",
        };

  const categories = useMemo(
    () => [...new Set(availableEvents.map((event) => event.category).filter(isDefinedOption))],
    [availableEvents],
  );
  const cities = useMemo(
    () => [...new Set(availableEvents.map((event) => event.city).filter(isDefinedOption))],
    [availableEvents],
  );
  const countries = useMemo(
    () => [...new Set(availableEvents.map((event) => event.countryCode).filter(isDefinedOption))],
    [availableEvents],
  );

  const filteredEvents = useMemo(() => {
    const normalizedSearch = deferredSearchInput.trim().toLowerCase();
    const now = Date.now();

    return [...availableEvents]
      .filter((event) => {
        if (categoryFilter !== "all" && event.category !== categoryFilter) {
          return false;
        }
        if (cityFilter !== "all" && event.city !== cityFilter) {
          return false;
        }
        if (countryFilter !== "all" && event.countryCode !== countryFilter) {
          return false;
        }
        if (
          normalizedSearch &&
          ![
            event.name,
            event.symbol,
            event.city,
            event.countryCode,
            event.venueName,
            event.category,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        ) {
          return false;
        }
        return !event.startsAt || event.startsAt >= now - 86_400_000;
      })
      .sort((left, right) => {
        if (!left.startsAt && !right.startsAt) {
          return left.name.localeCompare(right.name);
        }
        if (!left.startsAt) {
          return 1;
        }
        if (!right.startsAt) {
          return -1;
        }
        return left.startsAt - right.startsAt;
      });
  }, [availableEvents, categoryFilter, cityFilter, countryFilter, deferredSearchInput]);

  const featuredEvent =
    filteredEvents.find((event) => event.ticketEventId === selectedEventId) ??
    filteredEvents[0] ??
    availableEvents[0] ??
    null;

  useEffect(() => {
    if (featuredEvent && featuredEvent.ticketEventId !== selectedEventId) {
      setSelectedEventId(featuredEvent.ticketEventId);
    }
  }, [featuredEvent, selectedEventId, setSelectedEventId]);

  const benefitBadges = getEventBenefitBadges(locale);

  return (
    <div className="route-stack explore-route" data-testid="explore-page">
      <PageHeader title={copy.title} subtitle={copy.subtitle} workspace="explore" />

      {featuredEvent ? (
        <section className="explore-hero-panel">
          <div className="explore-hero-copy">
            <p className="eyebrow">{copy.featured}</p>
            <h2>{copy.heroTitle}</h2>
            <p>{copy.heroBody}</p>
            <div className="inline-actions">
              {benefitBadges.map((badge) => (
                <Tag key={badge} tone="info">
                  {badge}
                </Tag>
              ))}
            </div>
            <div className="inline-actions">
              <Badge tone="success" emphasis="solid">
                {copy.upcoming}
              </Badge>
              <span className="explore-hero-meta">
                {formatEventStart(featuredEvent.startsAt)} |{" "}
                {[featuredEvent.venueName, featuredEvent.city, featuredEvent.countryCode]
                  .filter(Boolean)
                  .join(" | ")}
              </span>
            </div>
            <div className="inline-actions">
              <Link
                to={`/app/explore/${featuredEvent.ticketEventId}`}
                className="button-link primary"
                onClick={() => setSelectedEventId(featuredEvent.ticketEventId)}
              >
                {copy.viewEvent}
              </Link>
              <Link to="/app/marketplace" className="button-link ghost">
                {copy.marketLink}
              </Link>
            </div>
          </div>

          <div className="explore-hero-visual">
            <EventPoster event={featuredEvent} className="explore-hero-poster" />
          </div>
        </section>
      ) : null}

      <EventDemoNotice event={featuredEvent} compact />

      <Panel className="explore-filter-panel" surface="glass">
        <SectionHeader title={copy.filtersTitle} subtitle={copy.filtersSubtitle} />
        <div className="explore-filter-grid">
          <label>
            {copy.searchLabel}
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={copy.searchPlaceholder}
            />
          </label>
          <label>
            {copy.categoryLabel}
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">{copy.all}</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.cityLabel}
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
              <option value="all">{copy.all}</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.countryLabel}
            <select value={countryFilter} onChange={(event) => setCountryFilter(event.target.value)}>
              <option value="all">{copy.all}</option>
              {countries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      {filteredEvents.length === 0 ? (
        <EmptyState
          title={copy.noEventsTitle}
          description={copy.noEventsDescription}
          action={
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSearchInput("");
                setCategoryFilter("all");
                setCityFilter("all");
                setCountryFilter("all");
              }}
            >
              {copy.reset}
            </button>
          }
        />
      ) : null}

      {filteredEvents.length > 0 ? (
        <SectionHeader
          title={copy.sectionTitle}
          subtitle={copy.sectionSubtitle}
          actions={<Tag tone="info">{filteredEvents.length.toString()}</Tag>}
        />
      ) : null}

      <section className="explore-card-grid">
        {filteredEvents.map((event) => (
          <Card key={event.ticketEventId} className="explore-event-card" surface="accent">
            <div className="explore-event-card-media">
              <EventPoster event={event} className="explore-card-poster" />
              <div className="explore-event-badge-row">
                {benefitBadges.map((badge) => (
                  <Tag key={`${event.ticketEventId}-${badge}`} tone="default">
                    {badge}
                  </Tag>
                ))}
              </div>
            </div>

            <div className="explore-event-card-copy">
              <div className="explore-event-card-header">
                <div>
                  <p className="eyebrow">{event.category ?? copy.liveEvent}</p>
                  <h3>{event.name}</h3>
                </div>
                <Badge tone="info">{`${copy.from} ${formatPol(BigInt(event.primaryPriceWei))} POL`}</Badge>
              </div>
              <p className="explore-event-card-subtitle">
                {formatEventStart(event.startsAt)} |{" "}
                {[event.venueName, event.city, event.countryCode].filter(Boolean).join(" | ") || event.ticketEventId}
              </p>
              <p className="explore-event-card-body">
                {locale === "fr"
                  ? "Decouvrez un parcours d'achat plus propre: billet verifiable, marche secondaire cadre, et reveal collectible apres usage."
                  : "Discover a cleaner buying flow: verifiable ticket ownership, controlled secondary resale, and a collectible reveal after use."}
              </p>
              <Link
                to={`/app/explore/${event.ticketEventId}`}
                className="button-link primary"
                onClick={() => setSelectedEventId(event.ticketEventId)}
              >
                {copy.viewEvent}
              </Link>
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
