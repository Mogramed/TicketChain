import { useCallback, useState } from "react";

import type { UiMode } from "../../types/chainticket";

const VENUE_SAFE_STORAGE_KEY = "chainticket.venue-safe-mode";
const UI_MODE_STORAGE_KEY = "chainticket.ui-mode";
const ONBOARDING_STORAGE_KEY = "chainticket.onboarding-seen";

function initialVenueSafeMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(VENUE_SAFE_STORAGE_KEY) === "true";
}

function initialUiMode(): UiMode {
  if (typeof window === "undefined") {
    return "guide";
  }
  const saved = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
  return saved === "advanced" ? "advanced" : "guide";
}

function initialOnboardingSeen(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
}

export function useUiPreferences() {
  const [venueSafeMode, setVenueSafeModeState] = useState<boolean>(() => initialVenueSafeMode());
  const [uiMode, setUiModeState] = useState<UiMode>(() => initialUiMode());
  const [onboardingSeen, setOnboardingSeenState] = useState<boolean>(() => initialOnboardingSeen());

  const setVenueSafeMode = useCallback((enabled: boolean) => {
    setVenueSafeModeState(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VENUE_SAFE_STORAGE_KEY, enabled ? "true" : "false");
    }
  }, []);

  const setUiMode = useCallback((mode: UiMode) => {
    setUiModeState(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(UI_MODE_STORAGE_KEY, mode);
    }
  }, []);

  const setOnboardingSeen = useCallback((seen: boolean) => {
    setOnboardingSeenState(seen);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, seen ? "true" : "false");
    }
  }, []);

  return {
    venueSafeMode,
    setVenueSafeMode,
    uiMode,
    setUiMode,
    onboardingSeen,
    setOnboardingSeen,
  };
}
