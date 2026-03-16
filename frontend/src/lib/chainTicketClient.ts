import type {
  ChainTicketClient,
  ChainTicketEvent,
  ContractConfig,
  MarketStats,
  MarketplaceView,
  TicketView,
  WalletProviderInfo,
} from "../types/chainticket";
import { discoverWalletProviders } from "./wallet";
import { calculateMarketStats } from "./market";
import {
  createEthersBindings,
  type ChainTicketClientOptions,
} from "./chainTicketClient/bindings";
import type { ChainTicketBindings } from "./chainTicketClient/internalTypes";
import {
  DEFAULT_ADMIN_ROLE,
  normalizeAddress,
  PAUSER_ROLE,
  SCANNER_ADMIN_ROLE,
  sameAddress,
  SCANNER_ROLE,
  ZERO_ADDRESS,
} from "./chainTicketClient/parsers";
import {
  buildPreflightAction,
  createListingHealth,
} from "./chainTicketClient/preflight";
import { buildTicketTimeline } from "./chainTicketClient/ticketTimeline";

export { createListingHealth };
export type { ChainTicketClientOptions };

export function createChainTicketClientFromBindings(
  config: ContractConfig,
  bindings: ChainTicketBindings,
): ChainTicketClient {
  const listWithPermit = bindings.marketplace.listWithPermit;
  const getSignerAddress = async (): Promise<string | null> => {
    if (!bindings.getSignerAddress) {
      return null;
    }

    try {
      return normalizeAddress(await bindings.getSignerAddress());
    } catch {
      return null;
    }
  };

  const hasSigner = (): boolean => bindings.hasSigner?.() ?? Boolean(bindings.getSignerAddress);

  const getUserRoles = async (address: string) => {
    const normalizedAddress = normalizeAddress(address);
    const [ticketAdmin, ticketPauser, scannerAdmin, scanner] = await Promise.all([
      bindings.ticket.hasRole
        ? bindings.ticket.hasRole(DEFAULT_ADMIN_ROLE, normalizedAddress).catch(() => false)
        : Promise.resolve(false),
      bindings.ticket.hasRole
        ? bindings.ticket.hasRole(PAUSER_ROLE, normalizedAddress).catch(() => false)
        : Promise.resolve(false),
      bindings.checkInRegistry.hasRole
        ? bindings.checkInRegistry.hasRole(SCANNER_ADMIN_ROLE, normalizedAddress).catch(() => false)
        : Promise.resolve(false),
      bindings.checkInRegistry.hasRole
        ? bindings.checkInRegistry.hasRole(SCANNER_ROLE, normalizedAddress).catch(() => false)
        : Promise.resolve(false),
    ]);

    return {
      isAdmin: ticketAdmin,
      isScannerAdmin: scannerAdmin,
      isPauser: ticketPauser,
      isScanner: scanner,
    };
  };

  const preflightAction = buildPreflightAction({
    config,
    bindings,
    getSignerAddress,
    hasSigner,
  });

  const getListings = async (): Promise<MarketplaceView[]> => {
    const listedEvents = await bindings.marketplace.queryListedEvents(config.deploymentBlock);

    const uniqueTokenIds = Array.from(
      new Set(listedEvents.map((event) => event.tokenId.toString())),
      (value) => BigInt(value),
    ).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

    const listings = await Promise.all(
      uniqueTokenIds.map(async (tokenId): Promise<MarketplaceView | null> => {
        const listing = await bindings.marketplace.getListing(tokenId);
        if (sameAddress(listing.seller, ZERO_ADDRESS)) {
          return null;
        }

        return {
          tokenId,
          seller: normalizeAddress(listing.seller),
          price: listing.price,
          isActive: true,
        };
      }),
    );

    return listings.filter((listing): listing is MarketplaceView => listing !== null);
  };

  const getMyTickets = async (owner: string): Promise<TicketView[]> => {
    const normalizedOwner = normalizeAddress(owner);
    const transfers = await bindings.ticket.queryTransferEvents(normalizedOwner, config.deploymentBlock);

    const ownedIds = new Set<string>();
    for (const event of transfers) {
      const tokenKey = event.tokenId.toString();

      if (sameAddress(event.to, normalizedOwner)) {
        ownedIds.add(tokenKey);
      }

      if (sameAddress(event.from, normalizedOwner)) {
        ownedIds.delete(tokenKey);
      }
    }

    const tokenIds = Array.from(ownedIds.values(), (tokenString) => BigInt(tokenString)).sort(
      (left, right) => (left < right ? -1 : left > right ? 1 : 0),
    );

    const ticketDetails = await Promise.all(
      tokenIds.map(async (tokenId): Promise<TicketView | null> => {
        try {
          const [ownerAddress, used, tokenURI, listing] = await Promise.all([
            bindings.ticket.ownerOf(tokenId),
            bindings.ticket.isUsed(tokenId),
            bindings.ticket.tokenURI(tokenId),
            bindings.marketplace.getListing(tokenId),
          ]);

          if (!sameAddress(ownerAddress, normalizedOwner)) {
            return null;
          }

          const listingActive =
            !sameAddress(listing.seller, ZERO_ADDRESS) && sameAddress(listing.seller, normalizedOwner);

          return {
            tokenId,
            owner: ownerAddress,
            used,
            tokenURI,
            listed: listingActive,
            listingPrice: listingActive ? listing.price : null,
          };
        } catch {
          return null;
        }
      }),
    );

    return ticketDetails.filter((ticket): ticket is TicketView => ticket !== null);
  };

  const getTicketTimeline = async (tokenId: bigint) =>
    buildTicketTimeline(config, bindings, tokenId);

  return {
    discoverWallets: async (): Promise<WalletProviderInfo[]> => discoverWalletProviders(),

    getSystemState: async () => {
      const [
        primaryPrice,
        maxSupply,
        totalMinted,
        maxPerWallet,
        paused,
        collectibleMode,
        baseUris,
      ] = await Promise.all([
        bindings.ticket.primaryPrice(),
        bindings.ticket.maxSupply(),
        bindings.ticket.totalMinted(),
        bindings.ticket.maxPerWallet(),
        bindings.ticket.paused(),
        bindings.ticket.collectibleMode(),
        bindings.ticket.baseUris
          ? bindings.ticket.baseUris().catch(() => ({
              baseTokenURI: "",
              collectibleBaseURI: "",
            }))
          : Promise.resolve({
              baseTokenURI: "",
              collectibleBaseURI: "",
            }),
      ]);

      return {
        primaryPrice,
        maxSupply,
        totalMinted,
        maxPerWallet,
        paused,
        collectibleMode,
        baseTokenURI: baseUris.baseTokenURI,
        collectibleBaseURI: baseUris.collectibleBaseURI,
      };
    },

    getMyTickets,

    getListings,

    getMarketStats: async (): Promise<MarketStats> => {
      const [listings, primaryPrice] = await Promise.all([
        getListings(),
        bindings.ticket.primaryPrice().catch(() => null),
      ]);

      return calculateMarketStats(listings, primaryPrice);
    },

    getTicketTimeline,

    preflightAction,

    watchEvents: (onEvent: (event: ChainTicketEvent) => void) => {
      if (!bindings.subscribeEvents) {
        return () => undefined;
      }
      return bindings.subscribeEvents(onEvent);
    },

    mintPrimary: async () => {
      const price = await bindings.ticket.primaryPrice();
      return bindings.ticket.mintPrimary(price);
    },

    approveTicket: async (tokenId: bigint) => bindings.ticket.approve(config.marketplaceAddress, tokenId),

    listTicket: async (tokenId: bigint, price: bigint) => bindings.marketplace.list(tokenId, price),

    listTicketWithPermit: listWithPermit
      ? async (tokenId: bigint, price: bigint) => listWithPermit(tokenId, price)
      : undefined,

    cancelListing: async (tokenId: bigint) => bindings.marketplace.cancel(tokenId),

    buyTicket: async (tokenId: bigint, price: bigint) => bindings.marketplace.buy(tokenId, price),

    getUserRoles,

    markTicketUsed: async (tokenId: bigint) => {
      if (!bindings.checkInRegistry.markUsed) {
        throw new Error("Check-in write function is unavailable in the current client.");
      }
      return bindings.checkInRegistry.markUsed(tokenId);
    },

    grantScannerRole: async (account: string) => {
      if (!bindings.checkInRegistry.grantScanner) {
        throw new Error("Scanner role grant is unavailable in the current client.");
      }
      return bindings.checkInRegistry.grantScanner(account);
    },

    revokeScannerRole: async (account: string) => {
      if (!bindings.checkInRegistry.revokeScanner) {
        throw new Error("Scanner role revoke is unavailable in the current client.");
      }
      return bindings.checkInRegistry.revokeScanner(account);
    },

    pauseSystem: async () => {
      if (!bindings.ticket.pause) {
        throw new Error("Pause action is unavailable in the current client.");
      }
      return bindings.ticket.pause();
    },

    unpauseSystem: async () => {
      if (!bindings.ticket.unpause) {
        throw new Error("Unpause action is unavailable in the current client.");
      }
      return bindings.ticket.unpause();
    },

    setCollectibleMode: async (enabled: boolean) => {
      if (!bindings.ticket.setCollectibleMode) {
        throw new Error("Collectible mode action is unavailable in the current client.");
      }
      return bindings.ticket.setCollectibleMode(enabled);
    },
  };
}

export function createChainTicketClient(
  config: ContractConfig,
  options: ChainTicketClientOptions = {},
): ChainTicketClient {
  const bindings = createEthersBindings(config, options);
  return createChainTicketClientFromBindings(config, bindings);
}
