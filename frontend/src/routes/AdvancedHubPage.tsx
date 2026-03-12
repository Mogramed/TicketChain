import { Link } from "react-router-dom";

import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  PageHeader,
  Tag,
} from "../components/ui/Primitives";
import { SafetyCockpit } from "../components/layout/SafetyCockpit";
import { useI18n } from "../i18n/I18nContext";
import { useAppState } from "../state/AppStateContext";

export function AdvancedHubPage() {
  const { t } = useI18n();
  const { userRoles, uiMode } = useAppState();

  return (
    <div className="route-stack" data-testid="advanced-page">
      <PageHeader
        title={t("advancedHubTitle")}
        subtitle={t("advancedHubSubtitle")}
        context={
          <Badge tone="info">
            {uiMode === "guide" ? t("uiModeGuide") : t("uiModeAdvanced")}
          </Badge>
        }
      />

      <section className="advanced-grid">
        <Card>
          <h3>{t("navScanner")}</h3>
          <p>Gate check-in tools for venue operations.</p>
          <div className="inline-actions">
            <Tag tone={userRoles.isScanner ? "success" : "warning"}>
              {userRoles.isScanner ? t("accessGranted") : t("accessRestricted")}
            </Tag>
          </div>
          <ButtonGroup>
            <Link to="/app/scanner" className="button-link primary">
              {t("openScanner")}
            </Link>
          </ButtonGroup>
        </Card>

        <Card>
          <h3>{t("navOrganizer")}</h3>
          <p>System monitoring and sensitive operations for authorized staff.</p>
          <div className="inline-actions">
            <Tag
              tone={userRoles.isAdmin || userRoles.isPauser || userRoles.isScannerAdmin ? "success" : "warning"}
            >
              {userRoles.isAdmin || userRoles.isPauser || userRoles.isScannerAdmin
                ? t("accessGranted")
                : t("accessRestricted")}
            </Tag>
          </div>
          <ButtonGroup>
            <Link to="/app/organizer" className="button-link primary">
              {t("openOrganizer")}
            </Link>
          </ButtonGroup>
        </Card>

        <Card>
          <h3>{t("navSettings")}</h3>
          <p>Language, display, safety mode, and runtime diagnostics.</p>
          <ButtonGroup>
            <Link to="/app/advanced/settings" className="button-link primary">
              {t("openSettings")}
            </Link>
          </ButtonGroup>
        </Card>
      </section>

      <DetailAccordion title="Operational data" subtitle="Expanded safety and chain diagnostics">
        <SafetyCockpit />
      </DetailAccordion>
    </div>
  );
}
