import { BrowserProvider, type Signer } from "ethers";

import type { ContractConfig, WalletProviderInfo } from "../types/chainticket";

export interface ConnectedWallet {
  signer: Signer;
  provider: BrowserProvider;
  address: string;
  chainId: number;
  providerInfo: WalletProviderInfo;
}

export interface WalletLifecycleHandlers {
  onAccountsChanged?: (accounts: string[]) => void;
  onChainChanged?: (chainId: number) => void;
  onDisconnect?: () => void;
}

function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    if (value.startsWith("0x")) {
      const parsedHex = Number.parseInt(value, 16);
      return Number.isFinite(parsedHex) ? parsedHex : null;
    }

    const parsedDec = Number(value);
    return Number.isFinite(parsedDec) ? parsedDec : null;
  }

  return null;
}

async function switchToTargetNetwork(
  provider: BrowserProvider,
  config: ContractConfig,
): Promise<void> {
  const chainHex = `0x${config.chainId.toString(16)}`;

  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: chainHex }]);
  } catch (error) {
    const maybeCode = (error as { code?: number }).code;

    if (maybeCode !== 4902) {
      throw error;
    }

    await provider.send("wallet_addEthereumChain", [
      {
        chainId: chainHex,
        chainName: config.chainName,
        rpcUrls: [config.rpcUrl],
        nativeCurrency: {
          name: "POL",
          symbol: "POL",
          decimals: 18,
        },
        blockExplorerUrls: ["https://amoy.polygonscan.com"],
      },
    ]);
  }
}

function buildLegacyProviderInfo(provider: EthereumProvider): WalletProviderInfo {
  return {
    id: "legacy-injected",
    name: provider.isMetaMask ? "MetaMask" : "Injected Wallet",
    isMetaMask: Boolean(provider.isMetaMask),
    provider,
  };
}

function buildAnnouncedProviderInfo(
  detail: Eip6963AnnounceProviderEventDetail,
): WalletProviderInfo {
  return {
    id: detail.info.uuid,
    name: detail.info.name,
    icon: detail.info.icon,
    rdns: detail.info.rdns,
    isMetaMask: /metamask/i.test(detail.info.name) || detail.provider.isMetaMask === true,
    provider: detail.provider,
  };
}

function sortWallets(wallets: WalletProviderInfo[]): WalletProviderInfo[] {
  return [...wallets].sort((left, right) => {
    if (left.isMetaMask !== right.isMetaMask) {
      return left.isMetaMask ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

export async function discoverWalletProviders(timeoutMs = 220): Promise<WalletProviderInfo[]> {
  if (typeof window === "undefined") {
    return [];
  }

  const providers = new Map<string, WalletProviderInfo>();

  if (window.ethereum) {
    const legacy = buildLegacyProviderInfo(window.ethereum);
    providers.set(legacy.id, legacy);
  }

  const onAnnounceProvider = (event: Event) => {
    const customEvent = event as WindowEventMap["eip6963:announceProvider"];
    const detail = customEvent.detail;
    if (!detail?.provider || !detail.info?.uuid) {
      return;
    }

    const info = buildAnnouncedProviderInfo(detail);
    providers.set(info.id, info);

    // Deduplicate legacy entry if it refers to the same provider object.
    for (const [key, entry] of providers.entries()) {
      if (key !== info.id && entry.provider === info.provider) {
        providers.delete(key);
      }
    }
  };

  window.addEventListener("eip6963:announceProvider", onAnnounceProvider);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  await new Promise((resolve) => window.setTimeout(resolve, timeoutMs));

  window.removeEventListener("eip6963:announceProvider", onAnnounceProvider);

  return sortWallets(Array.from(providers.values()));
}

export async function connectBrowserWallet(
  config: ContractConfig,
  providerInfo?: WalletProviderInfo,
): Promise<ConnectedWallet> {
  const provider = providerInfo?.provider ?? window.ethereum;

  if (!provider) {
    throw new Error("No EVM wallet detected. Install MetaMask or another injected wallet.");
  }

  const resolvedProviderInfo = providerInfo ?? buildLegacyProviderInfo(provider);
  const browserProvider = new BrowserProvider(provider);

  await switchToTargetNetwork(browserProvider, config);
  await browserProvider.send("eth_requestAccounts", []);

  const signer = await browserProvider.getSigner();
  const address = await signer.getAddress();
  const network = await browserProvider.getNetwork();
  const chainId = Number(network.chainId);

  if (chainId !== config.chainId) {
    throw new Error(`Wrong network. Please use ${config.chainName}.`);
  }

  return { signer, provider: browserProvider, address, chainId, providerInfo: resolvedProviderInfo };
}

export function subscribeWalletLifecycle(
  provider: EthereumProvider,
  handlers: WalletLifecycleHandlers,
): () => void {
  if (!provider.on || !provider.removeListener) {
    return () => undefined;
  }

  const accountsListener = (value: unknown) => {
    const accounts = Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    handlers.onAccountsChanged?.(accounts);
  };

  const chainListener = (value: unknown) => {
    const chainId = parseChainId(value);
    if (chainId !== null) {
      handlers.onChainChanged?.(chainId);
    }
  };

  const disconnectListener = () => {
    handlers.onDisconnect?.();
  };

  provider.on("accountsChanged", accountsListener);
  provider.on("chainChanged", chainListener);
  provider.on("disconnect", disconnectListener);

  return () => {
    provider.removeListener?.("accountsChanged", accountsListener);
    provider.removeListener?.("chainChanged", chainListener);
    provider.removeListener?.("disconnect", disconnectListener);
  };
}
