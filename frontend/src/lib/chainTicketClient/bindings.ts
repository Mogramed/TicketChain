import {
  Contract,
  JsonRpcProvider,
  type ContractRunner,
  type Signer,
  type TransactionResponse,
} from "ethers";

import type { ChainTicketEvent, ContractConfig } from "../../types/chainticket";
import { CHECK_IN_REGISTRY_ABI, MARKETPLACE_ABI, TICKET_NFT_ABI } from "../abi";
import {
  getLogEventFromArgs,
  normalizeAddress,
  parseCancelledLog,
  parseCollectibleLog,
  parseListedLog,
  parseListing,
  parseSoldLog,
  parseTransferLog,
  parseUsedLog,
  sortByBlockAndLog,
  toBigInt,
  toTxResponse,
} from "./parsers";
import type { ChainTicketBindings } from "./internalTypes";

export interface ChainTicketClientOptions {
  signer?: Signer;
  readProvider?: JsonRpcProvider;
}

function requireSigner(signer: Signer | undefined, message: string): Signer {
  if (!signer) {
    throw new Error(message);
  }
  return signer;
}

function buildSubscribeEvents(
  ticketRead: Contract,
  marketplaceRead: Contract,
  checkInRead: Contract,
): (onEvent: (event: ChainTicketEvent) => void) => () => void {
  return (onEvent: (event: ChainTicketEvent) => void) => {
    const onTransfer = (...args: unknown[]) => {
      const log = parseTransferLog(getLogEventFromArgs(args));
      onEvent({
        type: "transfer",
        tokenId: log.tokenId,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
      });
    };

    const onListed = (...args: unknown[]) => {
      const log = parseListedLog(getLogEventFromArgs(args));
      onEvent({
        type: "listed",
        tokenId: log.tokenId,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
      });
    };

    const onCancelled = (...args: unknown[]) => {
      const log = parseCancelledLog(getLogEventFromArgs(args));
      onEvent({
        type: "cancelled",
        tokenId: log.tokenId,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
      });
    };

    const onSold = (...args: unknown[]) => {
      const log = parseSoldLog(getLogEventFromArgs(args));
      onEvent({
        type: "sold",
        tokenId: log.tokenId,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
      });
    };

    const onUsed = (...args: unknown[]) => {
      const log = parseUsedLog(getLogEventFromArgs(args));
      onEvent({
        type: "used",
        tokenId: log.tokenId,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
      });
    };

    const onCollectibleMode = (...args: unknown[]) => {
      const log = parseCollectibleLog(getLogEventFromArgs(args));
      onEvent({
        type: "collectible_mode",
        txHash: log.txHash,
        blockNumber: log.blockNumber,
      });
    };

    ticketRead.on(ticketRead.filters.Transfer(), onTransfer);
    ticketRead.on(ticketRead.filters.CollectibleModeUpdated(), onCollectibleMode);
    marketplaceRead.on(marketplaceRead.filters.Listed(), onListed);
    marketplaceRead.on(marketplaceRead.filters.Cancelled(), onCancelled);
    marketplaceRead.on(marketplaceRead.filters.Sold(), onSold);
    checkInRead.on(checkInRead.filters.TicketMarkedUsed(), onUsed);

    return () => {
      ticketRead.off(ticketRead.filters.Transfer(), onTransfer);
      ticketRead.off(ticketRead.filters.CollectibleModeUpdated(), onCollectibleMode);
      marketplaceRead.off(marketplaceRead.filters.Listed(), onListed);
      marketplaceRead.off(marketplaceRead.filters.Cancelled(), onCancelled);
      marketplaceRead.off(marketplaceRead.filters.Sold(), onSold);
      checkInRead.off(checkInRead.filters.TicketMarkedUsed(), onUsed);
    };
  };
}

export function createEthersBindings(
  config: ContractConfig,
  options: ChainTicketClientOptions,
): ChainTicketBindings {
  const readProvider =
    options.readProvider ?? new JsonRpcProvider(config.rpcUrl, config.chainId);

  const ticketRead = new Contract(
    config.ticketNftAddress,
    TICKET_NFT_ABI,
    readProvider,
  ) as Contract;
  const marketplaceRead = new Contract(
    config.marketplaceAddress,
    MARKETPLACE_ABI,
    readProvider,
  ) as Contract;
  const checkInRead = new Contract(
    config.checkInRegistryAddress,
    CHECK_IN_REGISTRY_ABI,
    readProvider,
  ) as Contract;

  const getWriteRunner = (): ContractRunner =>
    requireSigner(options.signer, "Connect a wallet to send transactions.");

  return {
    getSignerAddress: options.signer
      ? async () => {
          const signer = requireSigner(options.signer, "Signer is required");
          return signer.getAddress();
        }
      : undefined,
    hasSigner: () => Boolean(options.signer),
    getBlockTimestamp: async (blockNumber: number) => {
      const block = await readProvider.getBlock(blockNumber);
      return block ? block.timestamp : null;
    },
    subscribeEvents: buildSubscribeEvents(ticketRead, marketplaceRead, checkInRead),
    ticket: {
      hasRole: async (role: string, account: string) =>
        Boolean(await ticketRead.hasRole(role, account)),
      primaryPrice: async () => toBigInt(await ticketRead.primaryPrice()),
      maxSupply: async () => toBigInt(await ticketRead.maxSupply()),
      totalMinted: async () => toBigInt(await ticketRead.totalMinted()),
      maxPerWallet: async () => toBigInt(await ticketRead.maxPerWallet()),
      paused: async () => Boolean(await ticketRead.paused()),
      collectibleMode: async () => Boolean(await ticketRead.collectibleMode()),
      isUsed: async (tokenId: bigint) => Boolean(await ticketRead.isUsed(tokenId)),
      tokenURI: async (tokenId: bigint) => String(await ticketRead.tokenURI(tokenId)),
      ownerOf: async (tokenId: bigint) => String(await ticketRead.ownerOf(tokenId)),
      balanceOf: async (owner: string) => toBigInt(await ticketRead.balanceOf(owner)),
      getApproved: async (tokenId: bigint) => String(await ticketRead.getApproved(tokenId)),
      isApprovedForAll: async (owner: string, operator: string) =>
        Boolean(await ticketRead.isApprovedForAll(owner, operator)),
      mintPrimary: async (value: bigint) => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          mintPrimary: (overrides: { value: bigint }) => Promise<TransactionResponse>;
        };
        const tx = await writable.mintPrimary({ value });
        return toTxResponse(tx);
      },
      approve: async (spender: string, tokenId: bigint) => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          approve: (to: string, tokenId: bigint) => Promise<TransactionResponse>;
        };
        const tx = await writable.approve(spender, tokenId);
        return toTxResponse(tx);
      },
      pause: async () => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          pause: () => Promise<TransactionResponse>;
        };
        const tx = await writable.pause();
        return toTxResponse(tx);
      },
      unpause: async () => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          unpause: () => Promise<TransactionResponse>;
        };
        const tx = await writable.unpause();
        return toTxResponse(tx);
      },
      setCollectibleMode: async (enabled: boolean) => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          setCollectibleMode: (enabled: boolean) => Promise<TransactionResponse>;
        };
        const tx = await writable.setCollectibleMode(enabled);
        return toTxResponse(tx);
      },
      simulateMint: async (value: bigint) => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          mintPrimary: {
            staticCall: (overrides: { value: bigint }) => Promise<void>;
          };
        };
        await writable.mintPrimary.staticCall({ value });
      },
      estimateMintGas: async (value: bigint) => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          mintPrimary: {
            estimateGas: (overrides: { value: bigint }) => Promise<bigint>;
          };
        };
        return writable.mintPrimary.estimateGas({ value });
      },
      simulateApprove: async (spender: string, tokenId: bigint) => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          approve: {
            staticCall: (spender: string, tokenId: bigint) => Promise<void>;
          };
        };
        await writable.approve.staticCall(spender, tokenId);
      },
      estimateApproveGas: async (spender: string, tokenId: bigint) => {
        const writable = ticketRead.connect(getWriteRunner()) as unknown as {
          approve: {
            estimateGas: (spender: string, tokenId: bigint) => Promise<bigint>;
          };
        };
        return writable.approve.estimateGas(spender, tokenId);
      },
      queryTransferEvents: async (owner: string, fromBlock: number) => {
        const normalizedOwner = normalizeAddress(owner);
        const incoming = await ticketRead.queryFilter(
          ticketRead.filters.Transfer(null, normalizedOwner),
          fromBlock,
          "latest",
        );
        const outgoing = await ticketRead.queryFilter(
          ticketRead.filters.Transfer(normalizedOwner, null),
          fromBlock,
          "latest",
        );

        return sortByBlockAndLog(
          [...incoming, ...outgoing].map((log) => parseTransferLog(log)),
        );
      },
      queryTransferEventsByToken: async (tokenId: bigint, fromBlock: number) => {
        const logs = await ticketRead.queryFilter(
          ticketRead.filters.Transfer(null, null, tokenId),
          fromBlock,
          "latest",
        );

        return sortByBlockAndLog(logs.map((log) => parseTransferLog(log)));
      },
      queryCollectibleModeEvents: async (fromBlock: number) => {
        const logs = await ticketRead.queryFilter(
          ticketRead.filters.CollectibleModeUpdated(),
          fromBlock,
          "latest",
        );

        return sortByBlockAndLog(logs.map((log) => parseCollectibleLog(log)));
      },
    },
    marketplace: {
      list: async (tokenId: bigint, price: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          list: (tokenId: bigint, price: bigint) => Promise<TransactionResponse>;
        };
        const tx = await writable.list(tokenId, price);
        return toTxResponse(tx);
      },
      cancel: async (tokenId: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          cancel: (tokenId: bigint) => Promise<TransactionResponse>;
        };
        const tx = await writable.cancel(tokenId);
        return toTxResponse(tx);
      },
      buy: async (tokenId: bigint, price: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          buy: (
            tokenId: bigint,
            overrides: { value: bigint },
          ) => Promise<TransactionResponse>;
        };
        const tx = await writable.buy(tokenId, { value: price });
        return toTxResponse(tx);
      },
      getListing: async (tokenId: bigint) => parseListing(await marketplaceRead.getListing(tokenId)),
      simulateList: async (tokenId: bigint, price: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          list: {
            staticCall: (tokenId: bigint, price: bigint) => Promise<void>;
          };
        };
        await writable.list.staticCall(tokenId, price);
      },
      estimateListGas: async (tokenId: bigint, price: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          list: {
            estimateGas: (tokenId: bigint, price: bigint) => Promise<bigint>;
          };
        };
        return writable.list.estimateGas(tokenId, price);
      },
      simulateCancel: async (tokenId: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          cancel: {
            staticCall: (tokenId: bigint) => Promise<void>;
          };
        };
        await writable.cancel.staticCall(tokenId);
      },
      estimateCancelGas: async (tokenId: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          cancel: {
            estimateGas: (tokenId: bigint) => Promise<bigint>;
          };
        };
        return writable.cancel.estimateGas(tokenId);
      },
      simulateBuy: async (tokenId: bigint, price: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          buy: {
            staticCall: (tokenId: bigint, overrides: { value: bigint }) => Promise<void>;
          };
        };
        await writable.buy.staticCall(tokenId, { value: price });
      },
      estimateBuyGas: async (tokenId: bigint, price: bigint) => {
        const writable = marketplaceRead.connect(getWriteRunner()) as unknown as {
          buy: {
            estimateGas: (tokenId: bigint, overrides: { value: bigint }) => Promise<bigint>;
          };
        };
        return writable.buy.estimateGas(tokenId, { value: price });
      },
      queryListedEvents: async (fromBlock: number) => {
        const logs = await marketplaceRead.queryFilter(
          marketplaceRead.filters.Listed(),
          fromBlock,
          "latest",
        );

        return sortByBlockAndLog(logs.map((log) => parseListedLog(log)));
      },
      queryCancelledEvents: async (fromBlock: number) => {
        const logs = await marketplaceRead.queryFilter(
          marketplaceRead.filters.Cancelled(),
          fromBlock,
          "latest",
        );

        return sortByBlockAndLog(logs.map((log) => parseCancelledLog(log)));
      },
      querySoldEvents: async (fromBlock: number) => {
        const logs = await marketplaceRead.queryFilter(
          marketplaceRead.filters.Sold(),
          fromBlock,
          "latest",
        );

        return sortByBlockAndLog(logs.map((log) => parseSoldLog(log)));
      },
    },
    checkInRegistry: {
      hasRole: async (role: string, account: string) =>
        Boolean(await checkInRead.hasRole(role, account)),
      isUsed: async (tokenId: bigint) => Boolean(await checkInRead.isUsed(tokenId)),
      markUsed: async (tokenId: bigint) => {
        const writable = checkInRead.connect(getWriteRunner()) as unknown as {
          markUsed: (tokenId: bigint) => Promise<TransactionResponse>;
        };
        const tx = await writable.markUsed(tokenId);
        return toTxResponse(tx);
      },
      grantScanner: async (account: string) => {
        const writable = checkInRead.connect(getWriteRunner()) as unknown as {
          grantScanner: (account: string) => Promise<TransactionResponse>;
        };
        const tx = await writable.grantScanner(account);
        return toTxResponse(tx);
      },
      revokeScanner: async (account: string) => {
        const writable = checkInRead.connect(getWriteRunner()) as unknown as {
          revokeScanner: (account: string) => Promise<TransactionResponse>;
        };
        const tx = await writable.revokeScanner(account);
        return toTxResponse(tx);
      },
      queryUsedEvents: async (tokenId: bigint, fromBlock: number) => {
        const logs = await checkInRead.queryFilter(
          checkInRead.filters.TicketMarkedUsed(tokenId),
          fromBlock,
          "latest",
        );

        return sortByBlockAndLog(logs.map((log) => parseUsedLog(log)));
      },
    },
  };
}
