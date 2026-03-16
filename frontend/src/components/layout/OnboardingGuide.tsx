import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useI18n } from "../../i18n/I18nContext";
import { useAppState } from "../../state/useAppState";
import { Badge, ButtonGroup, Panel, ProgressStepper } from "../ui/Primitives";

export function OnboardingGuide() {
  const { t } = useI18n();
  const { onboardingSeen, setOnboardingSeen, connectWallet, walletAddress } = useAppState();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(
    () => [
      {
        key: "connect",
        title: t("onboardingConnectTitle"),
        description: t("onboardingConnectDescription"),
        route: "/app/explore",
      },
      {
        key: "buy",
        title: t("onboardingBuyTitle"),
        description: t("onboardingBuyDescription"),
        route: "/app/explore",
      },
      {
        key: "tickets",
        title: t("onboardingTicketsTitle"),
        description: t("onboardingTicketsDescription"),
        route: "/app/tickets",
      },
    ],
    [t],
  );

  if (onboardingSeen) {
    return null;
  }

  const currentStep = steps[stepIndex];
  const primaryLabel =
    currentStep.key === "connect"
      ? walletAddress
        ? t("onboardingContinue")
        : t("connectWallet")
      : currentStep.key === "buy"
        ? t("onboardingOpenBuy")
        : t("onboardingOpenTickets");
  const progress = steps.map((step, index) => {
    if (index < stepIndex) {
      return { label: step.title, status: "done" as const };
    }
    if (index === stepIndex) {
      return { label: step.title, status: "active" as const };
    }
    return { label: step.title, status: "upcoming" as const };
  });

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label={t("onboardingTitle")}>
      <Panel className="onboarding-panel">
        <header className="onboarding-header">
          <p>{t("onboardingTitle")}</p>
          <Badge tone="info">
            {stepIndex + 1} / {steps.length}
          </Badge>
        </header>

        <h2>{currentStep.title}</h2>
        <p>{currentStep.description}</p>

        <ProgressStepper steps={progress} />

        <ButtonGroup>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setStepIndex(0);
              setOnboardingSeen(true);
            }}
          >
            {t("onboardingSkip")}
          </button>
          {stepIndex > 0 ? (
            <button type="button" className="ghost" onClick={() => setStepIndex((value) => value - 1)}>
              {t("onboardingBack")}
            </button>
          ) : null}
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (currentStep.key === "connect" && !walletAddress) {
                void connectWallet();
              }
              void navigate(currentStep.route);

              if (stepIndex + 1 >= steps.length) {
                setOnboardingSeen(true);
                setStepIndex(0);
                return;
              }
              setStepIndex((value) => value + 1);
            }}
          >
            {stepIndex + 1 >= steps.length ? t("onboardingFinish") : primaryLabel}
          </button>
        </ButtonGroup>
      </Panel>
    </div>
  );
}
