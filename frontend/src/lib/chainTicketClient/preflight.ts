import { mapEthersError } from "../errors";
import type {
  ContractConfig,
  ListingHealth,
  PreflightAction,
  PreflightResult,
} from "../../types/chainticket";
import type { ChainTicketBindings } from "./internalTypes";
import { normalizeAddress, sameAddress, ZERO_ADDRESS } from "./parsers";

async function safeSimulation(
  simulate: (() => Promise<void>) | undefined,
  estimateGas: (() => Promise<bigint>) | undefined,
  blockers: string[],
): Promise<{ simulationPassed: boolean; gasEstimate: bigint | null }> {
  if (!simulate && !estimateGas) {
    return { simulationPassed: false, gasEstimate: null };
  }

  let simulationPassed = false;
  let gasEstimate: bigint | null = null;

  if (simulate) {
    try {
      await simulate();
      simulationPassed = true;
    } catch (error) {
      blockers.push(mapEthersError(error));
    }
  }

  if (estimateGas) {
    try {
      gasEstimate = await estimateGas();
    } catch (error) {
      blockers.push(`Gas estimation failed: ${mapEthersError(error)}`);
    }
  }

  return { simulationPassed, gasEstimate };
}

function uniqueMessages(messages: string[]): string[] {
  return Array.from(new Set(messages.filter((message) => message.trim().length > 0)));
}

export async function createListingHealth(
  bindings: ChainTicketBindings,
  tokenId: bigint,
  expectedSeller?: string,
  expectedPrice?: bigint,
): Promise<ListingHealth> {
  const [listing, used] = await Promise.all([
    bindings.marketplace.getListing(tokenId),
    bindings.checkInRegistry.isUsed(tokenId),
  ]);

  const isActive = !sameAddress(listing.seller, ZERO_ADDRESS);
  const normalizedExpectedSeller = expectedSeller ? normalizeAddress(expectedSeller) : null;
  const sellerMatchesExpectation = normalizedExpectedSeller
    ? sameAddress(listing.seller, normalizedExpectedSeller)
    : true;
  const priceMatchesExpectation = expectedPrice !== undefined ? listing.price === expectedPrice : true;

  let reason: string | undefined;
  if (!isActive) {
    reason = "Listing is no longer active.";
  } else if (used) {
    reason = "Ticket already marked used.";
  } else if (!sellerMatchesExpectation) {
    reason = "Listing seller changed since your last refresh.";
  } else if (!priceMatchesExpectation) {
    reason = "Listing price changed since your last refresh.";
  }

  return {
    tokenId,
    isActive,
    seller: isActive ? normalizeAddress(listing.seller) : null,
    price: isActive ? listing.price : null,
    used,
    sellerMatchesExpectation,
    priceMatchesExpectation,
    reason,
  };
}

async function getWalletCapRemaining(
  bindings: ChainTicketBindings,
  walletAddress: string,
): Promise<bigint | null> {
  const balanceReader = bindings.ticket.balanceOf;
  if (!balanceReader) {
    return null;
  }

  const [balance, maxPerWallet] = await Promise.all([
    balanceReader(walletAddress),
    bindings.ticket.maxPerWallet(),
  ]);

  const remaining = maxPerWallet - balance;
  return remaining > 0n ? remaining : 0n;
}

export function buildPreflightAction({
  config,
  bindings,
  getSignerAddress,
  hasSigner,
}: {
  config: ContractConfig;
  bindings: ChainTicketBindings;
  getSignerAddress: () => Promise<string | null>;
  hasSigner: () => boolean;
}): (action: PreflightAction) => Promise<PreflightResult> {
  return async (action: PreflightAction): Promise<PreflightResult> => {
    const blockers: string[] = [];
    const warnings: string[] = [];

    const signerAddress = await getSignerAddress();

    if (!hasSigner() || !signerAddress) {
      blockers.push("Connect a wallet to run a transaction pre-check.");
      return {
        action: action.type,
        ok: false,
        blockers,
        warnings,
        gasEstimate: null,
        simulationPassed: false,
        listingHealth: null,
        walletCapRemaining: null,
      };
    }

    const [systemState, walletCapRemaining] = await Promise.all([
      Promise.all([
        bindings.ticket.paused(),
        bindings.ticket.primaryPrice(),
        bindings.ticket.totalMinted(),
        bindings.ticket.maxSupply(),
      ]),
      getWalletCapRemaining(bindings, signerAddress),
    ]);

    const [isPaused, primaryPrice, totalMinted, maxSupply] = systemState;

    if (isPaused) {
      blockers.push("System is paused.");
    }

    let listingHealth: ListingHealth | null = null;
    let simulationPassed = false;
    let gasEstimate: bigint | null = null;

    if (action.type === "mint") {
      if (totalMinted >= maxSupply) {
        blockers.push("Event is sold out.");
      }

      if (walletCapRemaining !== null && walletCapRemaining <= 0n) {
        blockers.push("Wallet ticket limit reached.");
      }

      const simulation = await safeSimulation(
        () => bindings.ticket.simulateMint?.(primaryPrice) ?? Promise.resolve(),
        () => bindings.ticket.estimateMintGas?.(primaryPrice) ?? Promise.resolve(0n),
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "approve") {
      try {
        const owner = await bindings.ticket.ownerOf(action.tokenId);
        if (!sameAddress(owner, signerAddress)) {
          blockers.push("Only the owner can approve this ticket.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      const simulation = await safeSimulation(
        bindings.ticket.simulateApprove
          ? () =>
              bindings.ticket.simulateApprove?.(config.marketplaceAddress, action.tokenId) ??
              Promise.resolve()
          : undefined,
        bindings.ticket.estimateApproveGas
          ? () =>
              bindings.ticket.estimateApproveGas?.(config.marketplaceAddress, action.tokenId) ??
              Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "list") {
      if (action.price <= 0n) {
        blockers.push("Listing price must be greater than zero.");
      }
      if (action.price > primaryPrice) {
        blockers.push("Listing price exceeds primary cap.");
      }

      try {
        const owner = await bindings.ticket.ownerOf(action.tokenId);
        if (!sameAddress(owner, signerAddress)) {
          blockers.push("Only the owner can list this ticket.");
        }

        const approved = await bindings.ticket.getApproved?.(action.tokenId);
        const approvedForAll = await bindings.ticket.isApprovedForAll?.(
          signerAddress,
          config.marketplaceAddress,
        );

        if (
          approved !== undefined &&
          !sameAddress(approved, config.marketplaceAddress) &&
          !approvedForAll
        ) {
          blockers.push("Marketplace approval missing for this token.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      listingHealth = await createListingHealth(bindings, action.tokenId);
      if (listingHealth.used) {
        blockers.push("Used tickets cannot be listed.");
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateList
          ? () => bindings.marketplace.simulateList?.(action.tokenId, action.price) ?? Promise.resolve()
          : undefined,
        bindings.marketplace.estimateListGas
          ? () => bindings.marketplace.estimateListGas?.(action.tokenId, action.price) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "list_with_permit") {
      if (action.price <= 0n) {
        blockers.push("Listing price must be greater than zero.");
      }
      if (action.price > primaryPrice) {
        blockers.push("Listing price exceeds primary cap.");
      }

      try {
        const owner = await bindings.ticket.ownerOf(action.tokenId);
        if (!sameAddress(owner, signerAddress)) {
          blockers.push("Only the owner can list this ticket.");
        }
      } catch (error) {
        blockers.push(mapEthersError(error));
      }

      listingHealth = await createListingHealth(bindings, action.tokenId);
      if (listingHealth.used) {
        blockers.push("Used tickets cannot be listed.");
      }

      if (!bindings.marketplace.listWithPermit) {
        blockers.push("One-step permit listing is unavailable in this wallet client.");
      } else {
        warnings.push("Wallet signature will be requested to authorize the marketplace in one step.");
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateListWithPermit
          ? () =>
              bindings.marketplace.simulateListWithPermit?.(action.tokenId, action.price) ??
              Promise.resolve()
          : undefined,
        bindings.marketplace.estimateListWithPermitGas
          ? () =>
              bindings.marketplace.estimateListWithPermitGas?.(action.tokenId, action.price) ??
              Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "cancel") {
      listingHealth = await createListingHealth(
        bindings,
        action.tokenId,
        action.expectedSeller,
      );

      if (!listingHealth.isActive) {
        blockers.push("Listing is already inactive.");
      }
      if (listingHealth.reason && !listingHealth.isActive) {
        warnings.push(listingHealth.reason);
      }
      if (listingHealth.seller && !sameAddress(listingHealth.seller, signerAddress)) {
        blockers.push("Only the listing seller can cancel this listing.");
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateCancel
          ? () => bindings.marketplace.simulateCancel?.(action.tokenId) ?? Promise.resolve()
          : undefined,
        bindings.marketplace.estimateCancelGas
          ? () => bindings.marketplace.estimateCancelGas?.(action.tokenId) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    if (action.type === "buy") {
      listingHealth = await createListingHealth(
        bindings,
        action.tokenId,
        action.expectedSeller,
        action.price,
      );

      if (!listingHealth.isActive) {
        blockers.push("Listing is no longer active.");
      }
      if (listingHealth.used) {
        blockers.push("Ticket is already used.");
      }
      if (!listingHealth.sellerMatchesExpectation) {
        blockers.push("Listing seller changed. Refresh and retry.");
      }
      if (!listingHealth.priceMatchesExpectation) {
        blockers.push("Listing price changed. Refresh and retry.");
      }
      if (listingHealth.seller && sameAddress(listingHealth.seller, signerAddress)) {
        blockers.push("Seller cannot buy their own listing.");
      }
      if (walletCapRemaining !== null && walletCapRemaining <= 0n) {
        blockers.push("Buyer wallet limit reached.");
      }

      const simulation = await safeSimulation(
        bindings.marketplace.simulateBuy
          ? () => bindings.marketplace.simulateBuy?.(action.tokenId, action.price) ?? Promise.resolve()
          : undefined,
        bindings.marketplace.estimateBuyGas
          ? () => bindings.marketplace.estimateBuyGas?.(action.tokenId, action.price) ?? Promise.resolve(0n)
          : undefined,
        blockers,
      );
      simulationPassed = simulation.simulationPassed;
      gasEstimate = simulation.gasEstimate;
    }

    const uniqueBlockers = uniqueMessages(blockers);
    const uniqueWarnings = uniqueMessages(warnings);

    return {
      action: action.type,
      ok: uniqueBlockers.length === 0,
      blockers: uniqueBlockers,
      warnings: uniqueWarnings,
      gasEstimate,
      simulationPassed,
      listingHealth,
      walletCapRemaining,
    };
  };
}
