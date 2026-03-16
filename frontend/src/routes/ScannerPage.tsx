import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  InfoList,
  PageHeader,
  Panel,
  RiskBanner,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { extractTokenId } from "../lib/scannerToken";
import { useTicketScanner } from "../lib/scanner";
import { parseTokenIdInput } from "../lib/timeline";
import { useAppState } from "../state/useAppState";

function scannerModeLabel(mode: "native" | "fallback" | "manual"): string {
  if (mode === "native") {
    return "Native QR scan";
  }
  if (mode === "fallback") {
    return "Fallback QR scan";
  }
  return "Manual mode";
}

export function ScannerPage() {
  const { t } = useI18n();
  const { userRoles, preparePreview, setErrorMessage, txState, uiMode } = useAppState();

  const [tokenInput, setTokenInput] = useState("");
  const [lastDetectedValue, setLastDetectedValue] = useState("");
  const [scannerNotice, setScannerNotice] = useState("Ready for the next attendee.");
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
        setScannerNotice("QR payload captured, but no tokenId was detected. Review manually.");
        return;
      }

      setTokenInput(tokenId);
      setScannerNotice(
        sessionCheckInsRef.current.includes(tokenId)
          ? `Ticket #${tokenId} was already checked in during this session.`
          : `Ticket #${tokenId} detected. Review and confirm the check-in.`,
      );
    },
  });

  const stopCamera = () => {
    stop();
    setScannerNotice("Camera stopped. Manual token entry remains available.");
  };

  const startCamera = async () => {
    const session = await start(videoRef.current);
    if (session.mode === "manual") {
      setScannerNotice(
        session.errorMessage
          ? `Manual fallback active: ${session.errorMessage}`
          : "Manual fallback active: no supported QR engine available.",
      );
      return;
    }

    setScannerNotice(`${session.engineLabel} active. Aim at attendee QR code.`);
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
      setScannerNotice(`Ticket #${tokenId} successfully checked in.`);
    }

    if (txState.status === "error") {
      const isDuplicate = (txState.errorReason ?? "").toLowerCase().includes("already used");
      setScannerNotice(
        isDuplicate
          ? `Duplicate check-in blocked for ticket #${lastSubmittedTokenRef.current || "?"}.`
          : txState.errorReason ?? "Check-in failed. Review the token and retry.",
      );
    }
  }, [txState]);

  const onMarkUsed = async () => {
    const tokenId = parseTokenIdInput(tokenInput);
    if (tokenId === null) {
      setErrorMessage("Enter a valid tokenId.");
      return;
    }

    if (sessionCheckIns.includes(tokenId.toString())) {
      const message = `Ticket #${tokenId.toString()} was already checked in during this session.`;
      setScannerNotice(message);
      setErrorMessage(message);
      return;
    }

    lastSubmittedTokenRef.current = tokenId.toString();
    setScannerNotice(`Previewing on-chain check-in for ticket #${tokenId.toString()}.`);

    await preparePreview({
      label: "Scanner check-in",
      description: "Mark ticket as used on-chain. This action is irreversible.",
      details: [
        "Confirms scanner role authorization.",
        "Verifies ticket exists and is not already used.",
        "Writes immutable check-in proof on-chain.",
      ],
      run: async (client) => {
        if (!client.markTicketUsed) {
          throw new Error("Scanner write method is unavailable in this client.");
        }
        return client.markTicketUsed(tokenId);
      },
    });
  };

  return (
    <div className="route-stack scanner-route" data-testid="scanner-page">
      <PageHeader
        title={t("scannerTitle")}
        subtitle="Gate control interface with native QR scan, ZXing fallback, and manual check-in continuity."
        context={
          <Badge tone={userRoles.isScanner ? "success" : "warning"}>
            {userRoles.isScanner ? "Scanner role ready" : "Scanner role required"}
          </Badge>
        }
        primaryAction={
          <button type="button" className="primary" onClick={() => void onMarkUsed()} disabled={!userRoles.isScanner}>
            {t("markUsed")}
          </button>
        }
        secondaryActions={
          <Link to="/app/advanced" className="button-link ghost">
            {t("navAdvanced")}
          </Link>
        }
      />

      {!userRoles.isScanner ? (
        <RiskBanner
          tone="error"
          title="Authorization missing"
          cause={t("scannerNeedsRole")}
          impact="Check-in transactions cannot be signed by this wallet."
          action="Switch to a wallet with scanner permissions."
        />
      ) : null}

      {cameraError ? (
        <RiskBanner
          tone="warning"
          title="Camera unavailable"
          cause={cameraError}
          impact="QR scanning is temporarily unavailable."
          action="Use manual token input or re-enable camera permissions."
        />
      ) : null}

      <Panel className="primary-panel">
        <section className="scanner-layout">
          <Panel className="scanner-command">
            <label>
              {t("tokenId")}
              <input
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="e.g. 123"
                inputMode="numeric"
              />
            </label>

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
                  setScannerNotice("Input cleared. Ready for the next attendee.");
                }}
              >
                Clear token
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

            <Card className="scanner-status-card">
              <InfoList
                entries={[
                  {
                    label: "Scanner mode",
                    value: `${scannerModeLabel(mode)} (${engineLabel})`,
                  },
                  {
                    label: "Camera",
                    value: cameraEnabled ? "Live feed active" : "Manual / standby",
                  },
                  {
                    label: "Target token",
                    value: tokenInput || "Not set",
                  },
                  {
                    label: "Last detected payload",
                    value: lastDetectedValue || "No QR payload captured yet",
                  },
                  {
                    label: "Scanner notice",
                    value: scannerNotice,
                  },
                  {
                    label: "Last tx status",
                    value: txState.label === "Scanner check-in" ? txState.status : "idle",
                  },
                ]}
              />
            </Card>

            {sessionCheckIns.length > 0 ? (
              <Card className="scanner-status-card">
                <p>
                  Session check-ins: <strong>{sessionCheckIns.join(", ")}</strong>
                </p>
              </Card>
            ) : null}
          </Panel>

          <Panel className="scanner-screen">
            <div className="scanner-video-shell venue-safe-block">
              <video ref={videoRef} playsInline muted />
              {!cameraEnabled ? (
                <div className="scanner-overlay">
                  <p>Venue-safe mode</p>
                  <strong>Ready to scan ticket QR</strong>
                  <span>Fallback order: native scan, ZXing fallback, then manual entry.</span>
                </div>
              ) : null}
            </div>
          </Panel>
        </section>
      </Panel>

      <DetailAccordion
        title="Scanner controls"
        subtitle="Operational notes for venue staff"
        defaultOpenDesktop={uiMode === "advanced"}
      >
        <ul className="plain-list">
          <li>Native `BarcodeDetector` is used first when QR support is available.</li>
          <li>ZXing Browser is used as the cross-device fallback scanner.</li>
          <li>Manual token input remains available when camera access is restricted.</li>
          <li>Only wallets with scanner role can submit check-in transactions.</li>
          <li>Check-in writes immutable usage status to the blockchain.</li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
