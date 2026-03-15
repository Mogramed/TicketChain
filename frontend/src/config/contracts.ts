import { isAddress } from "ethers";

import type { ContractConfig } from "../types/chainticket";

const FALLBACK_ADDRESS = "0x0000000000000000000000000000000000000000";
const SENSITIVE_PREFIXES = [
  "VITE_PRIVATE_KEY",
  "VITE_MNEMONIC",
  "VITE_API_KEY",
  "VITE_SECRET",
  "VITE_PASSWORD",
  "VITE_TOKEN",
] as const;

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const CONTRACT_CONFIG: ContractConfig = {
  chainId: 80002,
  chainName: "Polygon Amoy",
  rpcUrl: import.meta.env.VITE_AMOY_RPC_URL ?? "https://rpc-amoy.polygon.technology",
  explorerTxBaseUrl:
    import.meta.env.VITE_EXPLORER_TX_BASE_URL ?? "https://amoy.polygonscan.com/tx/",
  deploymentBlock: parseNumber(import.meta.env.VITE_DEPLOYMENT_BLOCK, 0),
  eventId: import.meta.env.VITE_DEFAULT_EVENT_ID?.trim() || "main-event",
  eventName: import.meta.env.VITE_DEFAULT_EVENT_NAME?.trim() || "Main Event",
  ticketNftAddress: import.meta.env.VITE_TICKET_NFT_ADDRESS ?? FALLBACK_ADDRESS,
  marketplaceAddress: import.meta.env.VITE_MARKETPLACE_ADDRESS ?? FALLBACK_ADDRESS,
  checkInRegistryAddress:
    import.meta.env.VITE_CHECKIN_REGISTRY_ADDRESS ?? FALLBACK_ADDRESS,
};

export function validateContractConfig(config: ContractConfig): string[] {
  const issues: string[] = [];

  if (!isAddress(config.ticketNftAddress)) {
    issues.push("Invalid VITE_TICKET_NFT_ADDRESS");
  }
  if (!isAddress(config.marketplaceAddress)) {
    issues.push("Invalid VITE_MARKETPLACE_ADDRESS");
  }
  if (!isAddress(config.checkInRegistryAddress)) {
    issues.push("Invalid VITE_CHECKIN_REGISTRY_ADDRESS");
  }
  if (config.deploymentBlock < 0 || !Number.isInteger(config.deploymentBlock)) {
    issues.push("VITE_DEPLOYMENT_BLOCK must be a positive integer");
  }

  const runtimeEnv = import.meta.env as Record<string, string | boolean | undefined>;
  for (const key of SENSITIVE_PREFIXES) {
    if (runtimeEnv[key] !== undefined) {
      issues.push(`${key} must not be exposed in frontend runtime environment`);
    }
  }

  return issues;
}

export function getExplorerTxUrl(baseUrl: string, hash: string): string {
  const normalized = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${normalized}${hash}`;
}
