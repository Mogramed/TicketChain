import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Panel,
  SectionHeader,
  Tag,
} from "../components/ui/Primitives";
import { IndexedReadinessBanner } from "../components/layout/IndexedReadinessBanner";
import { useI18n } from "../i18n/I18nContext";
import { formatAddress, formatTimestamp } from "../lib/format";
import { parseTokenIdInput, timelineLabel } from "../lib/timeline";
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
  const { fetchTicketTimeline, contractConfig, indexedReadsAvailable } = useAppState();

  const tokenId = tokenIdParam ? parseTokenIdInput(tokenIdParam) : null;

  const timelineQuery = useQuery({
    queryKey: ["ticket-timeline", tokenId?.toString() ?? "none"],
    enabled: tokenId !== null && indexedReadsAvailable,
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

  return (
    <div className="route-stack" data-testid="ticket-detail-page">
      <PageHeader
        title={`${t("timelineTitle")} ${tokenId !== null ? `#${tokenId.toString()}` : ""}`}
        subtitle="Chronological on-chain evidence grouped by lifecycle phase."
        primaryAction={
          <Link to="/app/tickets" className="button-link ghost">
            {t("myTicketsTitle")}
          </Link>
        }
      />

      {tokenId === null ? <EmptyState title="Invalid token" description="Token id format is not valid." /> : null}
      {tokenId !== null && !indexedReadsAvailable ? (
        <IndexedReadinessBanner
          title="Ticket timeline unavailable"
          impact="The indexed timeline stays blocked until the BFF read model is ready for timeline queries."
        />
      ) : null}
      {indexedReadsAvailable && timelineQuery.isLoading ? (
        <EmptyState title="Loading timeline" description={t("timelineLoading")} />
      ) : null}
      {indexedReadsAvailable && !timelineQuery.isLoading && (timelineQuery.data?.length ?? 0) === 0 ? (
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
        {indexedReadsAvailable && grouped.length > 0 ? (
          <section className="phase-summary">
            <SectionHeader
              title="Lifecycle summary"
              subtitle="Fast overview by phase before reading detailed records."
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
          {indexedReadsAvailable
            ? (timelineQuery.data ?? []).map((entry) => (
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
              ))
            : null}
        </section>
      </Panel>
    </div>
  );
}
