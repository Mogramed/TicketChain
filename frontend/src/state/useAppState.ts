import { useContext } from "react";

import { AppStateValueContext } from "./AppStateValueContext";
import type { AppStateContextValue } from "./appState/types";

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateValueContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider.");
  }
  return context;
}
