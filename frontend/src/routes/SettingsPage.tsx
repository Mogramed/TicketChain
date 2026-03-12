import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  InfoList,
  PageHeader,
  Panel,
  SegmentedToggle,
  Tag,
} from "../components/ui/Primitives";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/I18nContext";
import { useAppState } from "../state/AppStateContext";

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const {
    runtimeConfig,
    venueSafeMode,
    setVenueSafeMode,
    userRoles,
    bffMode,
    uiMode,
    setUiMode,
    setOnboardingSeen,
  } = useAppState();

  const roleBadges: string[] = [];
  if (userRoles.isAdmin) {
    roleBadges.push(t("roleAdmin"));
  }
  if (userRoles.isScannerAdmin) {
    roleBadges.push("Scanner admin");
  }
  if (userRoles.isPauser) {
    roleBadges.push(t("rolePauser"));
  }
  if (userRoles.isScanner) {
    roleBadges.push(t("roleScanner"));
  }

  return (
    <div className="route-stack settings-route" data-testid="settings-page">
      <PageHeader
        title={t("settingsTitle")}
        subtitle="Display, safety, and environment settings for operational readiness."
        context={<Badge tone="info">Corporate clarity profile active</Badge>}
        secondaryActions={
          <Link to="/app/advanced" className="button-link ghost">
            {t("navAdvanced")}
          </Link>
        }
      />

      <Panel className="primary-panel">
        <section className="settings-grid">
          <Card>
            <h3>Language and display</h3>
            <p>Select the language used across all pages and transaction copy.</p>
            <SegmentedToggle<"fr" | "en">
              value={locale}
              onChange={setLocale}
              options={[
                { value: "fr", label: "FR" },
                { value: "en", label: "EN" },
              ]}
            />
            <p>{t("uiModeLabel")}</p>
            <SegmentedToggle<"guide" | "advanced">
              value={uiMode}
              onChange={setUiMode}
              options={[
                { value: "guide", label: t("uiModeGuide") },
                { value: "advanced", label: t("uiModeAdvanced") },
              ]}
            />
            <ButtonGroup>
              <button type="button" className="ghost" onClick={() => setOnboardingSeen(false)}>
                {t("reviewGuide")}
              </button>
            </ButtonGroup>
          </Card>

          <Card>
            <h3>Safety</h3>
            <p>{t("venueSafeHint")}</p>
            <ButtonGroup>
              <button
                type="button"
                className={venueSafeMode ? "primary" : "ghost"}
                onClick={() => setVenueSafeMode(!venueSafeMode)}
              >
                {venueSafeMode ? t("enabled") : t("disabled")}
              </button>
            </ButtonGroup>
            <div className="inline-actions">
              {roleBadges.length === 0 ? <p>{t("roleNone")}</p> : null}
              {roleBadges.map((role) => (
                <Tag key={role} tone="success">
                  {role}
                </Tag>
              ))}
            </div>
          </Card>

          <Card>
            <h3>Environment</h3>
            <InfoList
              entries={[
                { label: t("chainEnv"), value: runtimeConfig.chainEnv },
                { label: t("apiBaseUrl"), value: runtimeConfig.apiBaseUrl ?? "Not configured" },
                {
                  label: t("featureFlags"),
                  value: runtimeConfig.featureFlags.length ? runtimeConfig.featureFlags.join(", ") : "None",
                },
                { label: t("fallbackMode"), value: bffMode },
              ]}
            />
          </Card>
        </section>
      </Panel>

      <DetailAccordion
        title="Environment notes"
        subtitle="Read before changing deployment configuration"
        defaultOpenDesktop={uiMode === "advanced"}
      >
        <ul className="plain-list">
          <li>{t("fallbackModeHint")}</li>
          <li>Feature flags are read-only in this UI and controlled by environment variables.</li>
          <li>Role badges update automatically when wallet account changes.</li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
