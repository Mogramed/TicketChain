import { useI18n } from "../../i18n/I18nContext";
import { formatPol } from "../../lib/format";
import { useAppState } from "../../state/useAppState";
import { Badge, Card, InfoList, Panel, SectionHeader, Tag } from "../ui/Primitives";

function bffModeLabel(
  mode: "disabled" | "probing" | "online" | "degraded" | "offline",
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (mode === "online") {
    return t("bffOnline");
  }
  if (mode === "degraded") {
    return t("bffDegraded");
  }
  if (mode === "offline") {
    return t("bffOffline");
  }
  if (mode === "probing") {
    return "Probing";
  }
  return t("bffDisabled");
}

export function SafetyCockpit() {
  const { t } = useI18n();
  const {
    contractConfig,
    walletChainId,
    systemState,
    walletCapRemaining,
    bffMode,
    indexedReadsIssue,
    lastChainEvent,
    pendingPreview,
  } = useAppState();

  const listingHealth = pendingPreview?.preflight?.listingHealth ?? null;
  const onSecureNetwork = walletChainId === contractConfig.chainId;

  return (
    <Panel className="safety-shell" data-testid="safety-cockpit">
      <SectionHeader
        title={t("safetyCockpit")}
        subtitle="Operational safeguards and risk visibility for every transaction flow."
        actions={
          <div className="inline-actions">
            <Tag tone={onSecureNetwork ? "success" : "warning"}>
              {onSecureNetwork ? "Secure" : "Attention"}
            </Tag>
            <Tag tone={systemState?.paused ? "danger" : "success"}>
              {systemState?.paused ? t("paused") : t("active")}
            </Tag>
          </div>
        }
      />

      <div className="safety-grid">
        <Card>
          <h3>{t("network")}</h3>
          <p>
            {onSecureNetwork
              ? t("networkSecure", { chainName: contractConfig.chainName })
              : walletChainId
                ? t("networkWrong", { chainId: walletChainId })
                : t("networkNotConnected")}
          </p>
        </Card>
        <Card>
          <h3>Safety Snapshot</h3>
          <InfoList
            entries={[
              {
                label: t("walletCapRemaining"),
                value: walletCapRemaining !== null ? walletCapRemaining.toString() : "-",
              },
              {
                label: t("collectibleMode"),
                value: systemState?.collectibleMode ? t("enabled") : t("disabled"),
              },
              { label: t("backendStatus"), value: bffModeLabel(bffMode, t) },
            ]}
          />
        </Card>
        <Card>
          <h3>Listing Health</h3>
          <p>
            {listingHealth
              ? listingHealth.isActive
                ? `${formatPol(listingHealth.price ?? 0n)} POL`
                : listingHealth.reason ?? "Inactive"
              : "-"}
          </p>
        </Card>
        <Card className="safety-feed">
          <h3>{t("liveChainFeed")}</h3>
          <p>{bffMode === "online" ? lastChainEvent : indexedReadsIssue ?? "Waiting for BFF live stream."}</p>
          <Badge tone={bffMode === "online" ? "info" : bffMode === "offline" ? "warning" : "default"}>
            {bffMode === "online" ? "Live events via BFF SSE" : "Live feed paused until indexed reads are ready"}
          </Badge>
        </Card>
      </div>

      <p className="rules-note">{t("rulesText")}</p>
    </Panel>
  );
}
