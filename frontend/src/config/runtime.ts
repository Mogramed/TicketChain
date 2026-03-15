import type { RuntimeConfig } from "../types/chainticket";

const DEFAULT_CHAIN_ENV = "amoy";

function normalizeOptionalString(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseFeatureFlags(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .split(",")
        .map((flag) => flag.trim().toLowerCase())
        .filter((flag) => flag.length > 0),
    ),
  );
}

function normalizeApiBaseUrl(value: string | undefined): string | null {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return null;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

export const RUNTIME_CONFIG: RuntimeConfig = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  chainEnv:
    import.meta.env.VITE_CHAIN_ENV === "mainnet-ready"
      ? "mainnet-ready"
      : DEFAULT_CHAIN_ENV,
  featureFlags: parseFeatureFlags(import.meta.env.VITE_FEATURE_FLAGS),
  defaultEventId: import.meta.env.VITE_DEFAULT_EVENT_ID?.trim() || "main-event",
  factoryAddress: normalizeOptionalString(import.meta.env.VITE_FACTORY_ADDRESS),
  governanceTimelockAddress: normalizeOptionalString(
    import.meta.env.VITE_GOVERNANCE_TIMELOCK_ADDRESS,
  ),
  governanceMinDelaySeconds: parseNonNegativeInteger(
    import.meta.env.VITE_GOVERNANCE_MIN_DELAY_SECONDS,
    0,
  ),
  governancePortalUrl: normalizeApiBaseUrl(import.meta.env.VITE_GOVERNANCE_PORTAL_URL),
};

export function hasFeatureFlag(config: RuntimeConfig, flag: string): boolean {
  return config.featureFlags.includes(flag.trim().toLowerCase());
}
