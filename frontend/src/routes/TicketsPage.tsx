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
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { formatAddress } from "../lib/format";
import { useAppState } from "../state/AppStateContext";

type TicketViewMode = "card" | "table";

export function TicketsPage() {
  const { t } = useI18n();
  const { tickets, walletAddress, watchlist, toggleWatch, refreshDashboard, uiMode, connectWallet } =
    useAppState();
  const [viewMode, setViewMode] = useState<TicketViewMode>("card");

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

  return (
    <div className="route-stack" data-testid="tickets-page">
      <PageHeader
        title={t("myTicketsTitle")}
        subtitle="Ownership inventory with immediate status visibility and timeline access."
        context={
          <div className="inline-actions">
            <Badge tone={walletAddress ? "success" : "warning"}>
              {walletAddress ? "Wallet connected" : "Wallet not connected"}
            </Badge>
            <Badge tone="success">{`Valid: ${ticketCounters.valid}`}</Badge>
            <Badge tone="warning">{`Checked-in: ${ticketCounters.used}`}</Badge>
            <Badge tone="info">{`Listed: ${ticketCounters.listed}`}</Badge>
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
              { value: "card", label: "Card" },
              { value: "table", label: "Table" },
            ]}
          />
        }
      />

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

      {walletAddress && sortedTickets.length === 0 ? (
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
        <SectionHeader
          title={t("ticketsOwnedTitle")}
          subtitle={t("ticketsOwnedSubtitle")}
          actions={<Badge tone="info">{sortedTickets.length.toString()}</Badge>}
        />
      ) : null}

      {viewMode === "card" ? (
        <section className="ticket-grid">
          {sortedTickets.map((ticket) => (
            <Card key={ticket.tokenId.toString()} className="ticket-card pass-card">
              <header>
                <h3>#{ticket.tokenId.toString()}</h3>
                <Badge tone={ticket.used ? "warning" : "success"}>
                  {ticket.used ? t("ticketUsed") : t("ticketValid")}
                </Badge>
              </header>

              <p>
                {t("ticketOwner")}: <strong>{formatAddress(ticket.owner)}</strong>
              </p>
              <p>
                {t("ticketListing")}: <strong>{ticket.listed ? t("active") : "-"}</strong>
              </p>

              <ButtonGroup>
                <Link to={`/app/tickets/${ticket.tokenId.toString()}`} className="button-link ghost">
                  {t("viewTimeline")}
                </Link>
                <button type="button" className="ghost" onClick={() => toggleWatch(ticket.tokenId)}>
                  {watchlist.has(ticket.tokenId.toString()) ? t("unwatch") : t("watch")}
                </button>
              </ButtonGroup>
            </Card>
          ))}
        </section>
      ) : (
        <Panel className="tickets-table-panel">
          <table className="market-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Listing</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTickets.map((ticket) => (
                <tr key={ticket.tokenId.toString()}>
                  <td>#{ticket.tokenId.toString()}</td>
                  <td>{ticket.used ? t("ticketUsed") : t("ticketValid")}</td>
                  <td>{formatAddress(ticket.owner)}</td>
                  <td>{ticket.listed ? t("active") : "-"}</td>
                  <td>
                    <ButtonGroup>
                      <Link to={`/app/tickets/${ticket.tokenId.toString()}`} className="button-link ghost">
                        {t("viewTimeline")}
                      </Link>
                      <button type="button" className="ghost" onClick={() => toggleWatch(ticket.tokenId)}>
                        {watchlist.has(ticket.tokenId.toString()) ? t("unwatch") : t("watch")}
                      </button>
                    </ButtonGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <DetailAccordion
        title="Ticket status guide"
        subtitle="How to interpret each pass status"
        defaultOpenDesktop={uiMode === "advanced"}
      >
        <ul className="plain-list">
          <li>Valid: ticket can still be transferred according to on-chain rules.</li>
          <li>Used: ticket has been checked in and cannot be resold.</li>
          <li>Listing: active listing means it is currently available on the market.</li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
