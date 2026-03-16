import { useEffect, useRef, useState } from "react";

import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  InfoList,
  PageHeader,
  Panel,
  RiskBanner,
  Tag,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { extractTokenId } from "../lib/scannerToken";
import { useTicketScanner } from "../lib/scanner";
import { parseTokenIdInput } from "../lib/timeline";
import { useAppState } from "../state/useAppState";

function scannerModeLabel(mode: "native" | "fallback" | "manual", locale: "fr" | "en"): string {
  if (mode === "native") {
    return locale === "fr" ? "Scan QR natif" : "Native QR scan";
  }
  if (mode === "fallback") {
    return locale === "fr" ? "Scan QR fallback" : "Fallback QR scan";
  }
  return locale === "fr" ? "Mode manuel" : "Manual mode";
}

function scannerStatusTone(
  txStatus: "idle" | "pending" | "success" | "error",
): "default" | "info" | "success" | "danger" {
  if (txStatus === "success") {
    return "success";
  }
  if (txStatus === "pending") {
    return "info";
  }
  if (txStatus === "error") {
    return "danger";
  }
  return "default";
}

export function ScannerPage() {
  const { locale, t } = useI18n();
  const { userRoles, preparePreview, setErrorMessage, txState, uiMode } = useAppState();

  const [tokenInput, setTokenInput] = useState("");
  const [lastDetectedValue, setLastDetectedValue] = useState("");
  const [scannerNotice, setScannerNotice] = useState(
    locale === "fr" ? "Pret pour le prochain participant." : "Ready for the next attendee.",
  );
  const [sessionCheckIns, setSessionCheckIns] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSubmittedTokenRef = useRef<string>("");
  const sessionCheckInsRef = useRef<string[]>([]);

  const {
    mode,
    cameraEnabled,
    errorMessage: cameraError,
    engineLabel,
    start,
    stop,
  } = useTicketScanner({
    onDetected: (rawValue) => {
      setLastDetectedValue(rawValue);
      const tokenId = extractTokenId(rawValue);
      if (!tokenId) {
        setScannerNotice(
          locale === "fr"
            ? "Payload QR capture, mais aucun tokenId n'a ete detecte. Verifiez manuellement."
            : "QR payload captured, but no tokenId was detected. Review manually.",
        );
        return;
      }

      setTokenInput(tokenId);
      setScannerNotice(
        sessionCheckInsRef.current.includes(tokenId)
          ? locale === "fr"
            ? `Le ticket #${tokenId} a deja ete check-in pendant cette session.`
            : `Ticket #${tokenId} was already checked in during this session.`
          : locale === "fr"
            ? `Ticket #${tokenId} detecte. Verifiez puis confirmez le check-in.`
            : `Ticket #${tokenId} detected. Review and confirm the check-in.`,
      );
    },
  });

  const stopCamera = () => {
    stop();
    setScannerNotice(
      locale === "fr"
        ? "Camera arretee. La saisie manuelle reste disponible."
        : "Camera stopped. Manual token entry remains available.",
    );
  };

  const startCamera = async () => {
    const session = await start(videoRef.current);
    if (session.mode === "manual") {
      setScannerNotice(
        session.errorMessage
          ? locale === "fr"
            ? `Fallback manuel actif : ${session.errorMessage}`
            : `Manual fallback active: ${session.errorMessage}`
          : locale === "fr"
            ? "Fallback manuel actif : aucun moteur QR compatible disponible."
            : "Manual fallback active: no supported QR engine available.",
      );
      return;
    }

    setScannerNotice(
      locale === "fr"
        ? `${session.engineLabel} actif. Visez le QR du participant.`
        : `${session.engineLabel} active. Aim at attendee QR code.`,
    );
  };

  useEffect(() => {
    sessionCheckInsRef.current = sessionCheckIns;
  }, [sessionCheckIns]);

  useEffect(() => {
    if (txState.label !== "Scanner check-in") {
      return;
    }

    if (txState.status === "success" && lastSubmittedTokenRef.current) {
      const tokenId = lastSubmittedTokenRef.current;
      setSessionCheckIns((current) =>
        current.includes(tokenId) ? current : [tokenId, ...current].slice(0, 8),
      );
      setScannerNotice(
        locale === "fr"
          ? `Ticket #${tokenId} check-in avec succes.`
          : `Ticket #${tokenId} successfully checked in.`,
      );
    }

    if (txState.status === "error") {
      const isDuplicate = (txState.errorReason ?? "").toLowerCase().includes("already used");
      setScannerNotice(
        isDuplicate
          ? locale === "fr"
            ? `Double check-in bloque pour le ticket #${lastSubmittedTokenRef.current || "?"}.`
            : `Duplicate check-in blocked for ticket #${lastSubmittedTokenRef.current || "?"}.`
          : txState.errorReason ??
              (locale === "fr"
                ? "Le check-in a echoue. Verifiez le token puis recommencez."
                : "Check-in failed. Review the token and retry."),
      );
    }
  }, [locale, txState]);

  const onMarkUsed = async () => {
    const tokenId = parseTokenIdInput(tokenInput);
    if (tokenId === null) {
      setErrorMessage(locale === "fr" ? "Entrez un tokenId valide." : "Enter a valid tokenId.");
      return;
    }

    if (sessionCheckIns.includes(tokenId.toString())) {
      const message =
        locale === "fr"
          ? `Le ticket #${tokenId.toString()} a deja ete check-in pendant cette session.`
          : `Ticket #${tokenId.toString()} was already checked in during this session.`;
      setScannerNotice(message);
      setErrorMessage(message);
      return;
    }

    lastSubmittedTokenRef.current = tokenId.toString();
    setScannerNotice(
      locale === "fr"
        ? `Apercu du check-in on-chain pour le ticket #${tokenId.toString()}.`
        : `Previewing on-chain check-in for ticket #${tokenId.toString()}.`,
    );

    await preparePreview({
      label: "Scanner check-in",
      description:
        locale === "fr"
          ? "Marquer le ticket comme utilise on-chain. Cette action est irreversible."
          : "Mark ticket as used on-chain. This action is irreversible.",
      details: [
        locale === "fr" ? "Confirme l'autorisation du role scanner." : "Confirms scanner role authorization.",
        locale === "fr"
          ? "Verifie que le ticket existe et n'est pas deja utilise."
          : "Verifies ticket exists and is not already used.",
        locale === "fr"
          ? "Ecrit une preuve de check-in immutable on-chain."
          : "Writes immutable check-in proof on-chain.",
      ],
      run: async (client) => {
        if (!client.markTicketUsed) {
          throw new Error(
            locale === "fr"
              ? "La methode scanner d'ecriture est indisponible dans ce client."
              : "Scanner write method is unavailable in this client.",
          );
        }
        return client.markTicketUsed(tokenId);
      },
    });
  };

  return (
    <div className="route-stack scanner-route venue-mode-route" data-testid="scanner-page">
      <PageHeader
        title="Scanner Mode"
        subtitle={
          locale === "fr"
            ? "Mode terrain minimaliste: contraste fort, statut geant, texte limite et fallback manuel toujours disponible."
            : "Minimal field mode: high contrast, oversized status, low text, and manual fallback always available."
        }
        workspace="organizer"
        context={
          <div className="inline-actions">
            <Badge tone={userRoles.isScanner ? "success" : "warning"} emphasis="solid">
              {userRoles.isScanner
                ? locale === "fr"
                  ? "Role scanner pret"
                  : "Scanner role ready"
                : locale === "fr"
                  ? "Role scanner requis"
                  : "Scanner role required"}
            </Badge>
            <Tag tone={scannerStatusTone(txState.status)}>{txState.status}</Tag>
          </div>
        }
        primaryAction={
          <button type="button" className="primary" onClick={() => void onMarkUsed()} disabled={!userRoles.isScanner}>
            {t("markUsed")}
          </button>
        }
      />

      {!userRoles.isScanner ? (
        <RiskBanner
          tone="error"
          title={locale === "fr" ? "Autorisation manquante" : "Authorization missing"}
          cause={t("scannerNeedsRole")}
          impact={
            locale === "fr"
              ? "Les transactions de check-in ne peuvent pas etre signees avec ce wallet."
              : "Check-in transactions cannot be signed by this wallet."
          }
          action={
            locale === "fr"
              ? "Passez sur un wallet disposant des permissions scanner."
              : "Switch to a wallet with scanner permissions."
          }
        />
      ) : null}

      {cameraError ? (
        <RiskBanner
          tone="warning"
          title={locale === "fr" ? "Camera indisponible" : "Camera unavailable"}
          cause={cameraError}
          impact={
            locale === "fr" ? "Le scan QR est temporairement indisponible." : "QR scanning is temporarily unavailable."
          }
          action={
            locale === "fr"
              ? "Utilisez la saisie manuelle du token ou reactivez les permissions camera."
              : "Use manual token input or re-enable camera permissions."
          }
        />
      ) : null}

      <section className="scanner-command-center">
        <Panel className="scanner-status-hero" surface="accent">
          <div className="scanner-status-copy">
            <p className="eyebrow">{scannerModeLabel(mode, locale)}</p>
            <h2>{scannerNotice}</h2>
            <div className="inline-actions">
              <Tag tone="info">{engineLabel}</Tag>
              <Tag tone={cameraEnabled ? "success" : "default"}>
                {cameraEnabled
                  ? locale === "fr"
                    ? "Camera active"
                    : "Camera live"
                  : locale === "fr"
                    ? "Manuel / veille"
                    : "Manual / standby"}
              </Tag>
              {tokenInput ? <Tag tone="default">Target #{tokenInput}</Tag> : null}
            </div>
          </div>
          <ButtonGroup>
            {!cameraEnabled ? (
              <button type="button" className="ghost" onClick={() => void startCamera()}>
                {t("startCamera")}
              </button>
            ) : (
              <button type="button" className="ghost" onClick={stopCamera}>
                {t("stopCamera")}
              </button>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setTokenInput("");
                setLastDetectedValue("");
                setScannerNotice(
                  locale === "fr"
                    ? "Saisie effacee. Pret pour le prochain participant."
                    : "Input cleared. Ready for the next attendee.",
                );
              }}
            >
              {locale === "fr" ? "Effacer le token" : "Clear token"}
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void onMarkUsed()}
              disabled={!userRoles.isScanner}
            >
              {t("markUsed")}
            </button>
          </ButtonGroup>
        </Panel>

        <section className="scanner-layout">
          <Panel className="scanner-screen scanner-screen-minimal" surface="glass">
            <div className="scanner-video-shell venue-safe-block">
              <video ref={videoRef} playsInline muted />
              {!cameraEnabled ? (
                <div className="scanner-overlay scanner-overlay-strong">
                  <p>{locale === "fr" ? "Mode terrain" : "Stress-safe mode"}</p>
                  <strong>{locale === "fr" ? "Pret a scanner le QR billet" : "Ready to scan ticket QR"}</strong>
                  <span>
                    {locale === "fr"
                      ? "Ordre de fallback : scan natif, fallback ZXing, puis saisie manuelle."
                      : "Fallback order: native scan, ZXing fallback, then manual entry."}
                  </span>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel className="scanner-command" surface="glass">
            <label>
              {t("tokenId")}
              <input
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="e.g. 123"
                inputMode="numeric"
              />
            </label>

            <Card className="scanner-status-card" surface="quiet">
              <InfoList
                entries={[
                  {
                    label: locale === "fr" ? "Mode scanner" : "Scanner mode",
                    value: `${scannerModeLabel(mode, locale)} (${engineLabel})`,
                  },
                  { label: locale === "fr" ? "Token cible" : "Target token", value: tokenInput || (locale === "fr" ? "Non defini" : "Not set") },
                  {
                    label: locale === "fr" ? "Dernier payload" : "Last payload",
                    value:
                      lastDetectedValue ||
                      (locale === "fr" ? "Aucun payload QR capture pour le moment" : "No QR payload captured yet"),
                  },
                  { label: locale === "fr" ? "Statut session" : "Session status", value: scannerNotice },
                ]}
              />
            </Card>

            {sessionCheckIns.length > 0 ? (
              <Card className="scanner-status-card" surface="quiet">
                <p>
                  {locale === "fr" ? "Check-ins de session :" : "Session check-ins:"}{" "}
                  <strong>{sessionCheckIns.join(", ")}</strong>
                </p>
              </Card>
            ) : null}
          </Panel>
        </section>
      </section>

      <DetailAccordion
        title={locale === "fr" ? "Controles scanner" : "Scanner controls"}
        subtitle={locale === "fr" ? "Notes operationnelles pour l'equipe terrain" : "Operational notes for venue staff"}
        defaultOpenDesktop={uiMode === "advanced"}
      >
        <ul className="plain-list">
          <li>
            {locale === "fr"
              ? "Le `BarcodeDetector` natif est utilise en premier quand le support QR est disponible."
              : "Native `BarcodeDetector` is used first when QR support is available."}
          </li>
          <li>
            {locale === "fr"
              ? "ZXing Browser sert de fallback scanner cross-device."
              : "ZXing Browser is used as the cross-device fallback scanner."}
          </li>
          <li>
            {locale === "fr"
              ? "La saisie manuelle du token reste disponible quand l'acces camera est restreint."
              : "Manual token input remains available when camera access is restricted."}
          </li>
          <li>
            {locale === "fr"
              ? "Seuls les wallets avec role scanner peuvent soumettre les transactions de check-in."
              : "Only wallets with scanner role can submit check-in transactions."}
          </li>
          <li>
            {locale === "fr"
              ? "Le check-in ecrit un statut d'usage immutable sur la blockchain."
              : "Check-in writes immutable usage status to the blockchain."}
          </li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
