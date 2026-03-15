import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useI18n } from "../../i18n/I18nContext";
import { useAppState } from "../../state/useAppState";
import type { RouteGuideMeta } from "../../types/chainticket";
import { ButtonGroup, Panel, Tag } from "../ui/Primitives";

function resolveRouteKey(pathname: string): RouteGuideMeta["routeKey"] {
  if (pathname.startsWith("/app/market")) {
    return "resale";
  }
  if (pathname.startsWith("/app/tickets")) {
    return "tickets";
  }
  if (
    pathname.startsWith("/app/advanced") ||
    pathname.startsWith("/app/scanner") ||
    pathname.startsWith("/app/organizer") ||
    pathname.startsWith("/app/settings")
  ) {
    return "advanced";
  }
  return "buy";
}

export function GlobalGuideBar() {
  const { t } = useI18n();
  const { walletAddress, connectWallet, setOnboardingSeen } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();

  const guideMeta = useMemo<RouteGuideMeta>(() => {
    const routeKey = resolveRouteKey(location.pathname);

    if (routeKey === "resale") {
      return {
        routeKey,
        title: t("globalGuideTitleResale"),
        currentStep: t("globalGuideStepResale"),
        recommendedAction: t("globalGuideActionResale"),
        actionLabel: walletAddress ? t("globalGuideOpenResale") : t("connectWallet"),
        actionTo: "/app/market",
      };
    }

    if (routeKey === "tickets") {
      return {
        routeKey,
        title: t("globalGuideTitleTickets"),
        currentStep: t("globalGuideStepTickets"),
        recommendedAction: t("globalGuideActionTickets"),
        actionLabel: walletAddress ? t("globalGuideOpenTickets") : t("connectWallet"),
        actionTo: "/app/tickets",
      };
    }

    if (routeKey === "advanced") {
      return {
        routeKey,
        title: t("globalGuideTitleAdvanced"),
        currentStep: t("globalGuideStepAdvanced"),
        recommendedAction: t("globalGuideActionAdvanced"),
        actionLabel: t("globalGuideOpenAdvanced"),
        actionTo: "/app/advanced",
      };
    }

    return {
      routeKey,
      title: t("globalGuideTitleBuy"),
      currentStep: t("globalGuideStepBuy"),
      recommendedAction: t("globalGuideActionBuy"),
      actionLabel: walletAddress ? t("globalGuideOpenBuy") : t("connectWallet"),
      actionTo: "/app/fan",
    };
  }, [location.pathname, t, walletAddress]);

  const onPrimaryAction = () => {
    if (!walletAddress && guideMeta.routeKey !== "advanced") {
      void connectWallet();
      return;
    }
    if (location.pathname !== guideMeta.actionTo) {
      void navigate(guideMeta.actionTo);
    }
  };

  return (
    <Panel className="global-guide-bar" role="status" aria-live="polite">
      <div className="global-guide-copy">
        <p className="global-guide-eyebrow">{t("globalGuideLabel")}</p>
        <h3>{guideMeta.title}</h3>
        <div className="global-guide-meta">
          <Tag tone="info">
            {t("globalGuideCurrentStep")}: {guideMeta.currentStep}
          </Tag>
        </div>
        <p className="global-guide-recommendation">
          <strong>{t("globalGuideRecommendedAction")}:</strong> {guideMeta.recommendedAction}
        </p>
      </div>
      <ButtonGroup compact>
        <button type="button" className="primary" onClick={onPrimaryAction}>
          {guideMeta.actionLabel}
        </button>
        <button type="button" className="ghost" onClick={() => setOnboardingSeen(false)}>
          {t("openGuide")}
        </button>
      </ButtonGroup>
    </Panel>
  );
}
