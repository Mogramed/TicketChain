import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Provider, Signer } from "ethers";

import { mapEthersError } from "../../lib/errors";
import { subscribeWalletLifecycle } from "../../lib/wallet";
import type { ChainTicketClient, ContractConfig, UserRoles, WalletProviderInfo } from "../../types/chainticket";
import { EMPTY_ROLES, type ClientFactory, type WalletConnector } from "./types";

interface WalletSessionArgs {
  contractConfig: ContractConfig;
  hasValidConfig: boolean;
  createClient: ClientFactory;
  walletConnector: WalletConnector;
  readClient: ChainTicketClient | null;
  clearMessages: () => void;
  setErrorMessage: (message: string) => void;
  setStatusMessage: (message: string) => void;
}

interface WalletSessionResult {
  walletProviders: WalletProviderInfo[];
  selectedProviderId: string;
  setSelectedProviderId: (providerId: string) => void;
  connectedProvider: WalletProviderInfo | null;
  walletAddress: string;
  walletChainId: number | null;
  walletClient: ChainTicketClient | null;
  userRoles: UserRoles;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

export function useWalletSession({
  contractConfig,
  hasValidConfig,
  createClient,
  walletConnector,
  readClient,
  clearMessages,
  setErrorMessage,
  setStatusMessage,
}: WalletSessionArgs): WalletSessionResult {
  const [walletProviders, setWalletProviders] = useState<WalletProviderInfo[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [connectedProvider, setConnectedProvider] = useState<WalletProviderInfo | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletClient, setWalletClient] = useState<ChainTicketClient | null>(null);
  const [userRoles, setUserRoles] = useState<UserRoles>(EMPTY_ROLES);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletSigner, setWalletSigner] = useState<Signer | null>(null);
  const [walletReadProvider, setWalletReadProvider] = useState<Provider | null>(null);
  const walletClientRef = useRef<ChainTicketClient | null>(null);

  const selectedProvider = useMemo(
    () =>
      walletProviders.find((provider) => provider.id === selectedProviderId) ??
      walletProviders[0] ??
      null,
    [selectedProviderId, walletProviders],
  );

  const clearWalletState = useCallback(() => {
    setWalletAddress("");
    setWalletChainId(null);
    setWalletClient(null);
    walletClientRef.current = null;
    setWalletSigner(null);
    setWalletReadProvider(null);
    setConnectedProvider(null);
    setUserRoles(EMPTY_ROLES);
  }, []);

  const loadUserRoles = useCallback(
    async (address: string, preferredClient: ChainTicketClient | null = null) => {
      const roleClient = preferredClient?.getUserRoles
        ? preferredClient
        : walletClientRef.current?.getUserRoles
          ? walletClientRef.current
          : readClient?.getUserRoles
          ? readClient
          : null;

      if (!roleClient?.getUserRoles) {
        setUserRoles(EMPTY_ROLES);
        return;
      }

      try {
        const roles = await roleClient.getUserRoles(address);
        setUserRoles(roles);
      } catch {
        setUserRoles(EMPTY_ROLES);
      }
    },
    [readClient],
  );

  useEffect(() => {
    if (!readClient) {
      return;
    }

    let isCancelled = false;

    void readClient
      .discoverWallets()
      .then((providers) => {
        if (isCancelled) {
          return;
        }

        setWalletProviders(providers);
        setSelectedProviderId((current) => {
          if (current && providers.some((provider) => provider.id === current)) {
            return current;
          }
          return providers[0]?.id ?? "";
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setWalletProviders([]);
          setSelectedProviderId("");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [readClient]);

  useEffect(() => {
    if (!connectedProvider) {
      return;
    }

    const unsubscribe = subscribeWalletLifecycle(connectedProvider.provider, {
      onAccountsChanged: (accounts) => {
        const first = accounts[0];
        if (!first) {
          clearWalletState();
          setStatusMessage("Wallet disconnected.");
          return;
        }

        setWalletAddress(first);
        setStatusMessage("Wallet account changed.");
        void loadUserRoles(first);
      },
      onChainChanged: (chainId) => {
        setWalletChainId(chainId);
        if (chainId !== contractConfig.chainId) {
          setErrorMessage(`Wrong network detected (${chainId}). Switch to ${contractConfig.chainName}.`);
        } else {
          setErrorMessage("");
          setStatusMessage(`Network switched to ${contractConfig.chainName}.`);
        }
      },
      onDisconnect: () => {
        clearWalletState();
        setStatusMessage("Wallet disconnected.");
      },
    });

    return () => {
      unsubscribe();
    };
  }, [
    clearWalletState,
    connectedProvider,
    contractConfig.chainId,
    contractConfig.chainName,
    loadUserRoles,
    setErrorMessage,
    setStatusMessage,
  ]);

  useEffect(() => {
    if (!walletSigner || !walletAddress) {
      return;
    }

    const nextWalletClient = createClient(contractConfig, {
      signer: walletSigner,
      readProvider: walletReadProvider ?? undefined,
    });
    walletClientRef.current = nextWalletClient;
    setWalletClient(nextWalletClient);
    void loadUserRoles(walletAddress, nextWalletClient);
  }, [
    contractConfig,
    createClient,
    loadUserRoles,
    walletAddress,
    walletReadProvider,
    walletSigner,
  ]);

  const disconnectWallet = useCallback(() => {
    clearWalletState();
    setStatusMessage("Wallet disconnected.");
  }, [clearWalletState, setStatusMessage]);

  const connectWallet = useCallback(async () => {
    if (!hasValidConfig) {
      setErrorMessage("Set valid frontend VITE_* variables before connecting wallet.");
      return;
    }

    setIsConnecting(true);
    clearMessages();

    try {
      const connected = await walletConnector(contractConfig, selectedProvider ?? undefined);
      setWalletAddress(connected.address);
      setWalletChainId(connected.chainId);
      setConnectedProvider(connected.providerInfo);
      setWalletSigner(connected.signer as Signer);
      setWalletReadProvider(connected.provider);
      setStatusMessage(`Connected ${connected.providerInfo.name} on chain ${connected.chainId}.`);
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    } finally {
      setIsConnecting(false);
    }
  }, [
    clearMessages,
    contractConfig,
    hasValidConfig,
    selectedProvider,
    setErrorMessage,
    setStatusMessage,
    walletConnector,
  ]);

  return {
    walletProviders,
    selectedProviderId,
    setSelectedProviderId,
    connectedProvider,
    walletAddress,
    walletChainId,
    walletClient,
    userRoles,
    isConnecting,
    connectWallet,
    disconnectWallet,
  };
}
