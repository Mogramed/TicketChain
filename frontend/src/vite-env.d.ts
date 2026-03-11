/* eslint-disable @typescript-eslint/no-unused-vars */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMOY_RPC_URL?: string;
  readonly VITE_EXPLORER_TX_BASE_URL?: string;
  readonly VITE_DEPLOYMENT_BLOCK?: string;
  readonly VITE_TICKET_NFT_ADDRESS?: string;
  readonly VITE_MARKETPLACE_ADDRESS?: string;
  readonly VITE_CHECKIN_REGISTRY_ADDRESS?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_CHAIN_ENV?: "amoy" | "mainnet-ready";
  readonly VITE_FEATURE_FLAGS?: string;
}

declare global {
  interface BarcodeDetectorOptions {
    formats?: string[];
  }

  interface BarcodeDetectorResult {
    rawValue?: string;
  }

  interface BarcodeDetector {
    detect: (source: ImageBitmapSource) => Promise<BarcodeDetectorResult[]>;
  }

  interface BarcodeDetectorConstructor {
    getSupportedFormats?: () => Promise<string[]>;
    new (options?: BarcodeDetectorOptions): BarcodeDetector;
  }

  const BarcodeDetector: BarcodeDetectorConstructor | undefined;

  interface EthereumProvider {
    isMetaMask?: boolean;
    request: (request: {
      method: string;
      params?: unknown[] | Record<string, unknown>;
    }) => Promise<unknown>;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  }

  interface Eip6963ProviderInfo {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  }

  interface Eip6963AnnounceProviderEventDetail {
    info: Eip6963ProviderInfo;
    provider: EthereumProvider;
  }

  interface Window {
    ethereum?: EthereumProvider;
  }

  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963AnnounceProviderEventDetail>;
    "eip6963:requestProvider": Event;
  }
}

export {};
