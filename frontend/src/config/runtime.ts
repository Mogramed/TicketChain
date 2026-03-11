import type { RuntimeConfig } from "../types/chainticket";

const DEFAULT_CHAIN_ENV = "amoy";

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
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export const RUNTIME_CONFIG: RuntimeConfig = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL),
  chainEnv:
    import.meta.env.VITE_CHAIN_ENV === "mainnet-ready"
      ? "mainnet-ready"
      : DEFAULT_CHAIN_ENV,
  featureFlags: parseFeatureFlags(import.meta.env.VITE_FEATURE_FLAGS),
};

export function hasFeatureFlag(config: RuntimeConfig, flag: string): boolean {
  return config.featureFlags.includes(flag.trim().toLowerCase());
}
