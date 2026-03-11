import { describe, expect, it, vi } from "vitest";

import {
  discoverWalletProviders,
  subscribeWalletLifecycle,
} from "./wallet";

describe("wallet utilities", () => {
  it("discovers legacy injected wallet", async () => {
    const legacyProvider: EthereumProvider = {
      isMetaMask: true,
      request: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    window.ethereum = legacyProvider;

    const providers = await discoverWalletProviders(1);

    expect(providers.length).toBeGreaterThan(0);
    expect(providers[0].provider).toBe(legacyProvider);
  });

  it("discovers EIP-6963 providers", async () => {
    const eipProvider: EthereumProvider = {
      request: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    const announce = () => {
      window.dispatchEvent(
        new CustomEvent("eip6963:announceProvider", {
          detail: {
            info: {
              uuid: "wallet-eip-1",
              name: "Test Wallet",
              icon: "",
              rdns: "com.test.wallet",
            },
            provider: eipProvider,
          },
        }),
      );
    };

    const requestListener = () => {
      announce();
    };

    window.addEventListener("eip6963:requestProvider", requestListener);

    const providers = await discoverWalletProviders(1);

    window.removeEventListener("eip6963:requestProvider", requestListener);

    expect(providers.some((provider) => provider.id === "wallet-eip-1")).toBe(true);
  });

  it("subscribes and reacts to wallet lifecycle events", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const provider: EthereumProvider = {
      request: vi.fn(),
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener);
      }),
      removeListener: vi.fn((event: string) => {
        listeners.delete(event);
      }),
    };

    const onAccountsChanged = vi.fn();
    const onChainChanged = vi.fn();
    const onDisconnect = vi.fn();

    const unsubscribe = subscribeWalletLifecycle(provider, {
      onAccountsChanged,
      onChainChanged,
      onDisconnect,
    });

    listeners.get("accountsChanged")?.(["0xabc"]);
    listeners.get("chainChanged")?.("0x13882");
    listeners.get("disconnect")?.();

    expect(onAccountsChanged).toHaveBeenCalledWith(["0xabc"]);
    expect(onChainChanged).toHaveBeenCalledWith(80002);
    expect(onDisconnect).toHaveBeenCalled();

    unsubscribe();
    expect(provider.removeListener).toHaveBeenCalled();
  });
});
