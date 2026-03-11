import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  Badge,
  ButtonGroup,
  Card,
  DetailAccordion,
  PageHeader,
  Panel,
  RiskBanner,
} from "../components/ui/Primitives";
import { useI18n } from "../i18n/I18nContext";
import { parseTokenIdInput } from "../lib/timeline";
import { useAppState } from "../state/AppStateContext";

function extractTokenId(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed.length) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }

  const fromQuery = trimmed.match(/[?&]tokenId=(\d+)/i);
  if (fromQuery?.[1]) {
    return fromQuery[1];
  }

  const fromPath = trimmed.match(/\/(\d+)(?:\D*)$/);
  if (fromPath?.[1]) {
    return fromPath[1];
  }

  const firstDigits = trimmed.match(/(\d{1,})/);
  return firstDigits?.[1] ?? null;
}

export function ScannerPage() {
  const { t } = useI18n();
  const { userRoles, preparePreview, setErrorMessage, uiMode } = useAppState();

  const [tokenInput, setTokenInput] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (scanIntervalRef.current !== null) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraEnabled(false);
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera API not available in this browser.");
      return;
    }

    if (typeof BarcodeDetector === "undefined") {
      setCameraError("BarcodeDetector API is not available. Use manual token entry.");
      return;
    }

    setCameraError("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (!videoRef.current) {
        return;
      }

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      detectorRef.current = new BarcodeDetector({
        formats: ["qr_code"],
      });

      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !detectorRef.current) {
          return;
        }

        try {
          const results = await detectorRef.current.detect(videoRef.current);
          if (!results.length) {
            return;
          }

          const candidate = results[0]?.rawValue ?? "";
          const tokenId = extractTokenId(candidate);
          if (tokenId) {
            setTokenInput(tokenId);
          }
        } catch {
          // Ignore transient frame detection errors.
        }
      }, 700);

      setCameraEnabled(true);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera initialization failed.");
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const onMarkUsed = async () => {
    const tokenId = parseTokenIdInput(tokenInput);
    if (tokenId === null) {
      setErrorMessage("Enter a valid tokenId.");
      return;
    }

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
        subtitle="Gate control interface with high-contrast feedback and immediate check-in actions."
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
                className="primary"
                onClick={() => void onMarkUsed()}
                disabled={!userRoles.isScanner}
              >
                {t("markUsed")}
              </button>
            </ButtonGroup>

            <Card className="scanner-status-card">
              <p>
                Camera: <strong>{cameraEnabled ? "Live feed active" : "Not streaming"}</strong>
              </p>
              <p>
                Target token: <strong>{tokenInput || "Not set"}</strong>
              </p>
            </Card>
          </Panel>

          <Panel className="scanner-screen">
            <div className="scanner-video-shell venue-safe-block">
              <video ref={videoRef} playsInline muted />
              {!cameraEnabled ? (
                <div className="scanner-overlay">
                  <p>Venue-safe mode</p>
                  <strong>Ready to scan ticket QR</strong>
                  <span>High contrast camera frame with instant visual feedback.</span>
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
          <li>Manual token input remains available when camera access is restricted.</li>
          <li>Only wallets with scanner role can submit check-in transactions.</li>
          <li>Check-in writes immutable usage status to the blockchain.</li>
        </ul>
      </DetailAccordion>
    </div>
  );
}
