import { useEffect, useRef, useState } from "react";

type ScanCallback = (rawValue: string) => void;

type BarcodeDetectorResultLike = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResultLike[]>;
};

type BarcodeDetectorConstructorLike = {
  getSupportedFormats?: () => Promise<string[]>;
  new (options?: BarcodeDetectorOptions): BarcodeDetectorLike;
};

type FallbackDecodeResultLike = {
  getText?: () => string;
};

type FallbackControlsLike = {
  stop: () => void;
};

type FallbackReaderLike = {
  decodeFromConstraints: (
    constraints: MediaStreamConstraints,
    previewElem: HTMLVideoElement,
    callbackFn: (
      result: FallbackDecodeResultLike | undefined,
      error: unknown,
      controls: FallbackControlsLike,
    ) => void,
  ) => Promise<FallbackControlsLike>;
};

export type ScannerMode = "native" | "fallback" | "manual";
export type ScannerStatus = "idle" | "scanning" | "manual";

export interface ScannerResolution {
  mode: ScannerMode;
  engineLabel: string;
  errorMessage: string;
}

export interface ScannerSession extends ScannerResolution {
  cameraEnabled: boolean;
  stop: () => void;
}

export interface ScannerDependencies {
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  barcodeDetectorCtor?: BarcodeDetectorConstructorLike;
  loadFallbackReader?: () => Promise<FallbackReaderLike>;
  scanIntervalMs?: number;
  dedupeMs?: number;
  now?: () => number;
}

export interface UseTicketScannerOptions {
  onDetected: ScanCallback;
  scanIntervalMs?: number;
  dedupeMs?: number;
  dependencies?: ScannerDependencies;
}

const DEFAULT_SCAN_INTERVAL_MS = 700;
const DEFAULT_DEDUPE_MS = 1200;

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function stopStream(videoElement: HTMLVideoElement): void {
  const current = videoElement.srcObject;
  if (current && typeof current === "object" && "getTracks" in current) {
    for (const track of (current as MediaStream).getTracks()) {
      track.stop();
    }
  }
  videoElement.srcObject = null;
}

function createDedupeGuard(onDetected: ScanCallback, now: () => number, dedupeMs: number): ScanCallback {
  let lastValue = "";
  let lastDetectedAt = 0;

  return (rawValue: string) => {
    const candidate = rawValue.trim();
    if (!candidate.length) {
      return;
    }

    const detectedAt = now();
    if (candidate === lastValue && detectedAt - lastDetectedAt < dedupeMs) {
      return;
    }

    lastValue = candidate;
    lastDetectedAt = detectedAt;
    onDetected(candidate);
  };
}

async function supportsNativeQrDetection(
  barcodeDetectorCtor?: BarcodeDetectorConstructorLike,
): Promise<boolean> {
  if (!barcodeDetectorCtor) {
    return false;
  }

  if (!barcodeDetectorCtor.getSupportedFormats) {
    return true;
  }

  try {
    const formats = await barcodeDetectorCtor.getSupportedFormats();
    return formats.includes("qr_code");
  } catch {
    return true;
  }
}

async function loadZxingReader(): Promise<FallbackReaderLike> {
  const { BrowserQRCodeReader } = await import("@zxing/browser");
  return new BrowserQRCodeReader(undefined, {
    delayBetweenScanAttempts: 300,
    delayBetweenScanSuccess: 900,
  });
}

export async function resolveScannerMode(
  dependencies: ScannerDependencies = {},
): Promise<ScannerResolution> {
  const mediaDevices = dependencies.mediaDevices ?? navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia) {
    return {
      mode: "manual",
      engineLabel: "Manual entry",
      errorMessage: "Camera API not available in this browser.",
    };
  }

  const barcodeDetectorCtor =
    dependencies.barcodeDetectorCtor ??
    (typeof BarcodeDetector === "undefined"
      ? undefined
      : (BarcodeDetector as BarcodeDetectorConstructorLike));
  if (await supportsNativeQrDetection(barcodeDetectorCtor)) {
    return {
      mode: "native",
      engineLabel: "BarcodeDetector",
      errorMessage: "",
    };
  }

  const loadFallbackReader = dependencies.loadFallbackReader ?? loadZxingReader;
  try {
    await loadFallbackReader();
    return {
      mode: "fallback",
      engineLabel: "ZXing Browser",
      errorMessage: "",
    };
  } catch {
    return {
      mode: "manual",
      engineLabel: "Manual entry",
      errorMessage: "No supported QR engine detected. Use manual token entry.",
    };
  }
}

export async function startScannerSession(
  videoElement: HTMLVideoElement,
  onDetected: ScanCallback,
  dependencies: ScannerDependencies = {},
): Promise<ScannerSession> {
  const mediaDevices = dependencies.mediaDevices ?? navigator.mediaDevices;
  const scanIntervalMs = dependencies.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS;
  const dedupeMs = dependencies.dedupeMs ?? DEFAULT_DEDUPE_MS;
  const now = dependencies.now ?? Date.now;
  const emitDetection = createDedupeGuard(onDetected, now, dedupeMs);
  const resolution = await resolveScannerMode(dependencies);

  if (resolution.mode === "manual") {
    return {
      ...resolution,
      cameraEnabled: false,
      stop: () => undefined,
    };
  }

  if (resolution.mode === "native") {
    const barcodeDetectorCtor =
      dependencies.barcodeDetectorCtor ??
      (typeof BarcodeDetector === "undefined"
        ? undefined
        : (BarcodeDetector as BarcodeDetectorConstructorLike));
    if (!barcodeDetectorCtor) {
      return {
        mode: "manual",
        engineLabel: "Manual entry",
        errorMessage: "BarcodeDetector API is not available. Use manual token entry.",
        cameraEnabled: false,
        stop: () => undefined,
      };
    }

    try {
      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      videoElement.srcObject = stream;
      await videoElement.play();

      const detector = new barcodeDetectorCtor({ formats: ["qr_code"] });
      const intervalId = window.setInterval(async () => {
        try {
          const results = await detector.detect(videoElement);
          const candidate = results[0]?.rawValue ?? "";
          if (candidate) {
            emitDetection(candidate);
          }
        } catch {
          // Ignore transient frame detection errors during continuous scan.
        }
      }, scanIntervalMs);

      return {
        ...resolution,
        cameraEnabled: true,
        stop: () => {
          window.clearInterval(intervalId);
          stopStream(videoElement);
        },
      };
    } catch (error) {
      stopStream(videoElement);
      return {
        mode: "manual",
        engineLabel: "Manual entry",
        errorMessage: describeError(error, "Camera initialization failed."),
        cameraEnabled: false,
        stop: () => undefined,
      };
    }
  }

  try {
    const loadFallbackReader = dependencies.loadFallbackReader ?? loadZxingReader;
    const reader = await loadFallbackReader();
    const controls = await reader.decodeFromConstraints(
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
      videoElement,
      (result) => {
        const candidate = result?.getText?.() ?? "";
        if (candidate) {
          emitDetection(candidate);
        }
      },
    );

    return {
      ...resolution,
      cameraEnabled: true,
      stop: () => {
        controls.stop();
        stopStream(videoElement);
      },
    };
  } catch (error) {
    stopStream(videoElement);
    return {
      mode: "manual",
      engineLabel: "Manual entry",
      errorMessage: describeError(error, "Fallback scanner initialization failed."),
      cameraEnabled: false,
      stop: () => undefined,
    };
  }
}

export function useTicketScanner({
  onDetected,
  scanIntervalMs,
  dedupeMs,
  dependencies,
}: UseTicketScannerOptions) {
  const onDetectedRef = useRef(onDetected);
  const sessionRef = useRef<ScannerSession | null>(null);
  const [mode, setMode] = useState<ScannerMode>("manual");
  const [status, setStatus] = useState<ScannerStatus>("manual");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [engineLabel, setEngineLabel] = useState("Manual entry");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  const stop = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setCameraEnabled(false);
    setStatus(mode === "manual" ? "manual" : "idle");
  };

  const start = async (videoElement: HTMLVideoElement | null): Promise<ScannerSession> => {
    if (!videoElement) {
      const manualSession: ScannerSession = {
        mode: "manual",
        engineLabel: "Manual entry",
        errorMessage: "Camera preview element is unavailable.",
        cameraEnabled: false,
        stop: () => undefined,
      };
      setMode(manualSession.mode);
      setStatus("manual");
      setCameraEnabled(false);
      setEngineLabel(manualSession.engineLabel);
      setErrorMessage(manualSession.errorMessage);
      return manualSession;
    }

    stop();

    const session = await startScannerSession(
      videoElement,
      (rawValue) => {
        onDetectedRef.current(rawValue);
      },
      {
        ...dependencies,
        scanIntervalMs,
        dedupeMs,
      },
    );

    sessionRef.current = session.mode === "manual" ? null : session;
    setMode(session.mode);
    setStatus(session.mode === "manual" ? "manual" : "scanning");
    setCameraEnabled(session.cameraEnabled);
    setEngineLabel(session.engineLabel);
    setErrorMessage(session.errorMessage);
    return session;
  };

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      sessionRef.current = null;
    };
  }, []);

  return {
    mode,
    status,
    cameraEnabled,
    errorMessage,
    engineLabel,
    start,
    stop,
  };
}
