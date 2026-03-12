import { useI18n } from "../../i18n/I18nContext";
import { useAppState } from "../../state/AppStateContext";
import { Badge, ButtonGroup, InfoList, Panel, RiskBanner } from "../ui/Primitives";

function preflightSummary(
  t: ReturnType<typeof useI18n>["t"],
  preflight: { ok: boolean; blockers: string[] } | null,
): string {
  if (!preflight) {
    return "No pre-check for this action.";
  }
  if (preflight.ok) {
    return t("preflightPassed");
  }
  return t("preflightBlocked", { reasons: preflight.blockers.join(" | ") });
}

export function TransactionPreviewDrawer() {
  const { t } = useI18n();
  const { pendingPreview, setPendingPreview, confirmPendingPreview } = useAppState();

  if (!pendingPreview) {
    return null;
  }

  const impactSummary = (() => {
    if (!pendingPreview.action) {
      return t("previewImpactGeneric");
    }
    switch (pendingPreview.action.type) {
      case "mint":
        return t("previewImpactMint");
      case "approve":
        return t("previewImpactApprove");
      case "list":
        return t("previewImpactList");
      case "cancel":
        return t("previewImpactCancel");
      case "buy":
        return t("previewImpactBuy");
      default:
        return t("previewImpactGeneric");
    }
  })();

  const blockers = pendingPreview.preflight?.blockers ?? [];
  const warnings = pendingPreview.preflight?.warnings ?? [];
  const precheckTone = !pendingPreview.preflight
    ? "warning"
    : pendingPreview.preflight.ok
      ? "success"
      : "error";
  const canConfirm = pendingPreview.preflight ? pendingPreview.preflight.ok : true;
  const needsApprovalGuidance =
    pendingPreview.action?.type === "list" &&
    blockers.some((blocker) => blocker.includes("Marketplace approval missing"));

  return (
    <div
      className="preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t("txPreviewTitle")}
    >
      <Panel className="preview-drawer">
        <header className="preview-header">
          <h2>{pendingPreview.label}</h2>
          <Badge tone={pendingPreview.preflight?.ok ? "success" : "warning"}>
            {pendingPreview.preflight?.ok ? "Safe to sign" : "Check required"}
          </Badge>
        </header>
        <p>{pendingPreview.description}</p>

        <RiskBanner
          tone={precheckTone}
          title={t("previewRiskTitle")}
          cause={preflightSummary(t, pendingPreview.preflight)}
          impact={impactSummary}
          action={
            blockers.length > 0
              ? blockers.join(" | ")
              : t("previewRiskActionClear")
          }
        />

        <InfoList
          entries={[
            {
              label: t("preflightStatus"),
              value: preflightSummary(t, pendingPreview.preflight),
            },
            {
              label: t("estimatedGas"),
              value:
                pendingPreview.preflight?.gasEstimate !== null &&
                pendingPreview.preflight?.gasEstimate !== undefined
                  ? pendingPreview.preflight.gasEstimate.toString()
                  : "n/a",
            },
          ]}
        />

        {warnings.length > 0 ? (
          <InfoList
            entries={warnings.map((warning, index) => ({
              label: `Warning ${index + 1}`,
              value: warning,
            }))}
          />
        ) : null}

        {needsApprovalGuidance ? (
          <RiskBanner
            tone="warning"
            title="Approval needed first"
            cause="This ticket has not been approved for the marketplace yet."
            impact="Listing cannot be signed until the approval transaction is confirmed."
            action="Close this drawer, run the approval step, then reopen the listing preview."
          />
        ) : null}

        <ul>
          {pendingPreview.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
        <ButtonGroup>
          <button
            type="button"
            className="ghost"
            onClick={() => setPendingPreview(null)}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => void confirmPendingPreview()}
            disabled={!canConfirm}
          >
            {canConfirm ? t("confirmAndSign") : "Resolve blockers first"}
          </button>
        </ButtonGroup>
      </Panel>
    </div>
  );
}
