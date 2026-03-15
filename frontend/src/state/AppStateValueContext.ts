import { createContext } from "react";

import type { AppStateContextValue } from "./appState/types";

export const AppStateValueContext = createContext<AppStateContextValue | null>(null);
