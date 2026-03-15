import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveScannerMode, startScannerSession } from "./scanner";

function makeVideoElement() {
  const video = document.createElement("video");
  Object.defineProperty(video, "srcObject", {
    value: null,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(video, "play", {
    value: vi.fn().mockResolvedValue(undefined),
    configurable: true,
  });
  return video;
}

describe("scanner utilities", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("prefers native scanning when QR support is available", async () => {
    const resolution = await resolveScannerMode({
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
      barcodeDetectorCtor: Object.assign(vi.fn(), {
        getSupportedFormats: vi.fn().mockResolvedValue(["qr_code"]),
      }),
    });

    expect(resolution).toMatchObject({
      mode: "native",
      engineLabel: "BarcodeDetector",
      errorMessage: "",
    });
  });

  it("falls back to ZXing when BarcodeDetector is unavailable", async () => {
    const resolution = await resolveScannerMode({
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
      loadFallbackReader: vi.fn().mockResolvedValue({
        decodeFromConstraints: vi.fn(),
      }),
    });

    expect(resolution).toMatchObject({
      mode: "fallback",
      engineLabel: "ZXing Browser",
      errorMessage: "",
    });
  });

  it("uses manual mode when camera APIs are missing", async () => {
    const resolution = await resolveScannerMode({
      mediaDevices: {} as Pick<MediaDevices, "getUserMedia">,
      barcodeDetectorCtor: undefined,
    });

    expect(resolution).toMatchObject({
      mode: "manual",
      engineLabel: "Manual entry",
    });
    expect(resolution.errorMessage).toMatch(/Camera API not available/i);
  });

  it("starts a native session, deduplicates payloads, and stops tracks cleanly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:30:00Z"));

    const onDetected = vi.fn();
    const trackStop = vi.fn();
    const video = makeVideoElement();
    const detect = vi.fn().mockResolvedValue([{ rawValue: "ticket-42" }]);
    const barcodeDetectorCtor = Object.assign(
      class FakeBarcodeDetector {
        detect = detect;
      },
      {
        getSupportedFormats: vi.fn().mockResolvedValue(["qr_code"]),
      },
    );

    const session = await startScannerSession(video, onDetected, {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: trackStop }],
        }),
      },
      barcodeDetectorCtor,
      scanIntervalMs: 100,
      dedupeMs: 1000,
    });

    expect(session.mode).toBe("native");
    expect(session.cameraEnabled).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(onDetected).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledWith("ticket-42");

    await vi.advanceTimersByTimeAsync(300);
    expect(onDetected).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-03-12T18:30:02Z"));
    await vi.advanceTimersByTimeAsync(100);
    expect(onDetected).toHaveBeenCalledTimes(2);

    session.stop();
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(video.srcObject).toBeNull();
  });

  it("starts a fallback session through ZXing and stops its controls", async () => {
    const onDetected = vi.fn();
    const controlStop = vi.fn();
    const video = makeVideoElement();

    const session = await startScannerSession(video, onDetected, {
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
      loadFallbackReader: vi.fn().mockResolvedValue({
        decodeFromConstraints: vi.fn().mockImplementation(
          async (
            _constraints: MediaStreamConstraints,
            _previewElem: HTMLVideoElement,
            callback: (result: { getText?: () => string } | undefined) => void,
          ) => {
            callback({ getText: () => "fallback-ticket" });
            return { stop: controlStop };
          },
        ),
      }),
    });

    expect(session.mode).toBe("fallback");
    expect(session.cameraEnabled).toBe(true);
    expect(onDetected).toHaveBeenCalledWith("fallback-ticket");

    session.stop();
    expect(controlStop).toHaveBeenCalledTimes(1);
  });
});
