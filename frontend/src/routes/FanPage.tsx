import { useMemo } from "react";

import {
  Badge,
  Card,
  DetailAccordion,
  EmptyState,
  InfoList,
  PageHeader,
  Panel,
  ProgressStepper,
  RiskBanner,
  SectionHeader,
} from "../components/ui/Primitives";
import { EventDemoNotice } from "../components/events/EventDemoNotice";
import { useI18n } from "../i18n/I18nContext";
import { formatAddress, formatTimestamp } from "../lib/format";
import { useAppState } from "../state/useAppState";

function preflightSummary(
  ok: boolean,
  blockers: string[],
  t: ReturnType<typeof useI18n>["t"],
): string {
  return ok ? t("preflightPassed") : t("preflightBlocked", { reasons: blockers.join(" | ") });
}

export function FanPage() {
  const { t } = useI18n();
  const {
    preparePreview,
    pendingPreview,
    txState,
    activity,
    watchAlerts,
    walletAddress,
    uiMode,
    connectWallet,
    availableEvents,
    selectedEventId,
  } = useAppState();
  const selectedEvent =
    availableEvents.find((event) => event.ticketEventId === selectedEventId) ?? null;

  const mintPreflight = useMemo(() => {
    if (!pendingPreview || pendingPreview.action?.type !== "mint" || !pendingPreview.preflight) {
      return null;
    }
    return pendingPreview.preflight;
  }, [pendingPreview]);

  const flowSteps = useMemo<
    Array<{ label: string; status: "done" | "active" | "upcoming" | "blocked" }>
  >(() => {
    const walletReady = Boolean(walletAddress);
    const precheckOk = Boolean(mintPreflight?.ok);
    const precheckBlocked = Boolean(mintPreflight && !mintPreflight.ok);
    const txStarted = txState.status !== "idle";

    return [
      { label: t("connectWallet"), status: walletReady ? "done" : "active" },
      {
        label: t("fanStepPrecheck"),
        status: !walletReady
          ? "upcoming"
          : precheckOk
            ? "done"
            : precheckBlocked
              ? "blocked"
              : "active",
      },
      {
        label: t("fanStepSign"),
        status: !walletReady || !precheckOk ? "upcoming" : txStarted ? "done" : "active",
      },
      {
        label: t("fanStepConfirm"),
        status:
          txState.status === "success"
            ? "done"
            : txState.status === "error"
              ? "blocked"
              : txState.status === "pending"
                ? "active"
                : "upcoming",
      },
    ];
  }, [mintPreflight, t, txState.status, walletAddress]);

  const onMint = async () => {
    await preparePreview({
      label: "Primary mint",
      description: "Mint one primary ticket at fixed price.",
      action: { type: "mint" },
      details: [
        "Checks pause, supply, and wallet cap.",
        "Runs local simulation before signing.",
        "Estimates gas before prompting the wallet.",
      ],
      run: (client) => client.mintPrimary(),
    });
  };

  return (
    <div className="route-stack" data-testid="fan-page">
      <PageHeader
        title={t("fanTitle")}
        subtitle="Primary purchase flow with transparent checks before wallet signature."
        context={
          <Badge tone={mintPreflight?.ok ?? true ? "success" : "warning"}>
            {t("preflightStatus")}:{" "}
            {mintPreflight
              ? preflightSummary(mintPreflight.ok, mintPreflight.blockers, t)
              : t("preflightPassed")}
          </Badge>
        }
        primaryAction={
          <button type="button" className="primary" onClick={() => void onMint()}>
            {t("mintPrimaryTicket")}
          </button>
        }
      />

      <EventDemoNotice event={selectedEvent} />

      <Panel className="primary-panel">
        <SectionHeader
          title={t("fanFlowTitle")}
          subtitle={t("fanFlowSubtitle")}
        />
        <ProgressStepper steps={flowSteps} />

        <Card>
          <h3>{t("currentTransaction")}</h3>
          <InfoList
            entries={[
              { label: "Status", value: txState.status },
              { label: "Label", value: txState.label ?? "None" },
              { label: "Hash", value: txState.hash ? formatAddress(txState.hash, 8) : "-" },
              { label: "Error", value: txState.errorReason ?? "-" },
            ]}
          />
        </Card>
      </Panel>

      {txState.status === "error" && txState.errorReason ? (
        <RiskBanner
          tone="error"
          title="Transaction failed"
          cause={txState.errorReason}
          impact="Primary mint did not complete on-chain."
          action="Check wallet confirmation, network, and pre-check details before retrying."
        />
      ) : null}

      <DetailAccordion
        title={t("history")}
        subtitle="Detailed transaction records for this wallet"
        defaultOpenDesktop={uiMode === "advanced"}
      >
        {walletAddress ? null : (
          <EmptyState
            title={t("emptyWalletTitle")}
            description={t("emptyWalletFanReason")}
            action={
              <button type="button" className="primary" onClick={() => void connectWallet()}>
                {t("connectWallet")}
              </button>
            }
          />
        )}
        {activity.length === 0 ? <EmptyState title="No activity yet" description={t("noActivity")} /> : null}
        <ul className="history-list">
          {activity.map((item, index) => (
            <li key={`${item.timestamp}-${item.status}-${index}`}>
              <div>
                <strong>{item.label ?? "Action"}</strong>
                <span>{formatTimestamp(item.timestamp)}</span>
              </div>
              <div>
                <span className={`pill ${item.status}`}>{item.status}</span>
                {item.hash ? <span>{formatAddress(item.hash, 8)}</span> : null}
                {item.errorReason ? <span>{item.errorReason}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      </DetailAccordion>

      <DetailAccordion
        title={t("watchlistAlerts")}
        subtitle="Market alerts linked to your watchlist"
        defaultOpenDesktop={uiMode === "advanced"}
      >
        {watchAlerts.length === 0 ? <p>{t("noAlerts")}</p> : null}
        <ul className="watch-alerts">
          {watchAlerts.map((alert, index) => (
            <li key={`${alert}-${index}`}>{alert}</li>
          ))}
        </ul>
      </DetailAccordion>

    </div>
  );
}
