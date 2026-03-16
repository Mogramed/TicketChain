import type {
  OrganizerSubrouteKey,
  WorkspaceConfig,
  WorkspaceKey,
} from "../types/chainticket";

export const WORKSPACE_CONFIGS: Record<WorkspaceKey, WorkspaceConfig> = {
  explore: {
    key: "explore",
    path: "/app/explore",
    accent: "aurora",
  },
  marketplace: {
    key: "marketplace",
    path: "/app/marketplace",
    accent: "cobalt",
  },
  tickets: {
    key: "tickets",
    path: "/app/tickets",
    accent: "mint",
  },
  organizer: {
    key: "organizer",
    path: "/app/organizer",
    accent: "ember",
  },
};

export function resolveWorkspace(pathname: string): WorkspaceKey {
  if (pathname.startsWith("/app/organizer")) {
    return "organizer";
  }
  if (pathname.startsWith("/app/tickets")) {
    return "tickets";
  }
  if (pathname.startsWith("/app/marketplace")) {
    return "marketplace";
  }
  return "explore";
}

export function resolveOrganizerSubroute(pathname: string): OrganizerSubrouteKey {
  if (pathname.startsWith("/app/organizer/scanner")) {
    return "scanner";
  }
  if (pathname.startsWith("/app/organizer/sales")) {
    return "sales";
  }
  if (pathname.startsWith("/app/organizer/settings")) {
    return "settings";
  }
  return "overview";
}

export const ORGANIZER_SUBROUTE_PATHS: Record<OrganizerSubrouteKey, string> = {
  overview: "/app/organizer",
  scanner: "/app/organizer/scanner",
  sales: "/app/organizer/sales",
  settings: "/app/organizer/settings",
};
