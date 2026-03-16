import { parseEther } from "ethers";
import { describe, expect, it, vi } from "vitest";

import { createChainTicketClientFromBindings } from "./chainTicketClient";
import type { ContractConfig, PreflightAction } from "../types/chainticket";

const config: ContractConfig = {
  chainId: 80002,
  chainName: "Polygon Amoy",
  rpcUrl: "https://rpc-amoy.polygon.technology",
  explorerTxBaseUrl: "https://amoy.polygonscan.com/tx/",
  deploymentBlock: 0,
  ticketNftAddress: "0x0000000000000000000000000000000000000011",
  marketplaceAddress: "0x0000000000000000000000000000000000000022",
  checkInRegistryAddress: "0x0000000000000000000000000000000000000033",
};

function fakeTx(hash: string) {
  return {
    hash,
    wait: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBaseBindings() {
  return {
    getSignerAddress: vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000BB"),
    hasSigner: vi.fn().mockReturnValue(true),
    getBlockTimestamp: vi.fn().mockResolvedValue(null),
    subscribeEvents: vi.fn().mockReturnValue(() => undefined),
    ticket: {
      hasRole: vi.fn().mockResolvedValue(false),
      primaryPrice: vi.fn().mockResolvedValue(parseEther("0.1")),
      maxSupply: vi.fn().mockResolvedValue(100n),
      totalMinted: vi.fn().mockResolvedValue(3n),
      maxPerWallet: vi.fn().mockResolvedValue(2n),
      paused: vi.fn().mockResolvedValue(false),
      collectibleMode: vi.fn().mockResolvedValue(false),
      baseUris: vi.fn().mockResolvedValue({
        baseTokenURI: "ipfs://ticket/base/",
        collectibleBaseURI: "ipfs://ticket/collectible/",
      }),
      isUsed: vi.fn().mockResolvedValue(false),
      tokenURI: vi.fn().mockImplementation(async (tokenId: bigint) => `ipfs://ticket/${tokenId}.json`),
      ownerOf: vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000BB"),
      balanceOf: vi.fn().mockResolvedValue(1n),
      getApproved: vi.fn().mockResolvedValue(config.marketplaceAddress),
      isApprovedForAll: vi.fn().mockResolvedValue(false),
      mintPrimary: vi.fn().mockResolvedValue(fakeTx("0xmint")),
      approve: vi.fn().mockResolvedValue(fakeTx("0xapprove")),
      simulateMint: vi.fn().mockResolvedValue(undefined),
      estimateMintGas: vi.fn().mockResolvedValue(12345n),
      simulateApprove: vi.fn().mockResolvedValue(undefined),
      estimateApproveGas: vi.fn().mockResolvedValue(23456n),
      queryTransferEvents: vi.fn().mockResolvedValue([]),
      queryTransferEventsByToken: vi.fn().mockResolvedValue([]),
      queryCollectibleModeEvents: vi.fn().mockResolvedValue([]),
    },
    marketplace: {
      list: vi.fn().mockResolvedValue(fakeTx("0xlist")),
      listWithPermit: vi.fn().mockResolvedValue(fakeTx("0xlist-permit")),
      cancel: vi.fn().mockResolvedValue(fakeTx("0xcancel")),
      buy: vi.fn().mockResolvedValue(fakeTx("0xbuy")),
      getListing: vi.fn().mockResolvedValue({
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.09"),
      }),
      simulateList: vi.fn().mockResolvedValue(undefined),
      estimateListGas: vi.fn().mockResolvedValue(34567n),
      simulateCancel: vi.fn().mockResolvedValue(undefined),
      estimateCancelGas: vi.fn().mockResolvedValue(45678n),
      simulateBuy: vi.fn().mockResolvedValue(undefined),
      estimateBuyGas: vi.fn().mockResolvedValue(56789n),
      queryListedEvents: vi.fn().mockResolvedValue([]),
      queryCancelledEvents: vi.fn().mockResolvedValue([]),
      querySoldEvents: vi.fn().mockResolvedValue([]),
    },
    checkInRegistry: {
      hasRole: vi.fn().mockResolvedValue(false),
      isUsed: vi.fn().mockResolvedValue(false),
      queryUsedEvents: vi.fn().mockResolvedValue([]),
    },
  };
}

describe("chainTicketClient", () => {
  it("builds wallet tickets from transfer history", async () => {
    const bindings = makeBaseBindings();

    bindings.ticket.ownerOf = vi.fn().mockImplementation(async (tokenId: bigint) => {
      if (tokenId === 1n) {
        return "0x00000000000000000000000000000000000000AA";
      }
      return "0x00000000000000000000000000000000000000BB";
    });

    bindings.ticket.queryTransferEvents = vi.fn().mockResolvedValue([
      {
        from: "0x0000000000000000000000000000000000000000",
        to: "0x00000000000000000000000000000000000000bb",
        tokenId: 1n,
        blockNumber: 1,
        logIndex: 1,
        txHash: "0x1",
      },
      {
        from: "0x0000000000000000000000000000000000000000",
        to: "0x00000000000000000000000000000000000000bb",
        tokenId: 2n,
        blockNumber: 2,
        logIndex: 1,
        txHash: "0x2",
      },
      {
        from: "0x00000000000000000000000000000000000000bb",
        to: "0x00000000000000000000000000000000000000aa",
        tokenId: 1n,
        blockNumber: 3,
        logIndex: 1,
        txHash: "0x3",
      },
    ]);

    bindings.marketplace.getListing = vi.fn().mockImplementation(async (tokenId: bigint) => {
      if (tokenId === 2n) {
        return {
          seller: "0x00000000000000000000000000000000000000BB",
          price: parseEther("0.09"),
        };
      }

      return {
        seller: "0x0000000000000000000000000000000000000000",
        price: 0n,
      };
    });

    const client = createChainTicketClientFromBindings(config, bindings);
    const tickets = await client.getMyTickets("0x00000000000000000000000000000000000000BB");

    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({
      tokenId: 2n,
      listed: true,
      listingPrice: parseEther("0.09"),
    });
  });

  it("returns only active listings and computes market stats", async () => {
    const bindings = makeBaseBindings();

    bindings.marketplace.queryListedEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 2n,
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.08"),
        blockNumber: 2,
        logIndex: 1,
        txHash: "0x2",
      },
      {
        tokenId: 5n,
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.09"),
        blockNumber: 3,
        logIndex: 1,
        txHash: "0x3",
      },
      {
        tokenId: 7n,
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.1"),
        blockNumber: 4,
        logIndex: 1,
        txHash: "0x4",
      },
    ]);

    bindings.marketplace.getListing = vi.fn().mockImplementation(async (tokenId: bigint) => {
      if (tokenId === 5n) {
        return {
          seller: "0x0000000000000000000000000000000000000000",
          price: 0n,
        };
      }

      return {
        seller: "0x00000000000000000000000000000000000000AA",
        price: tokenId === 2n ? parseEther("0.08") : parseEther("0.1"),
      };
    });

    const client = createChainTicketClientFromBindings(config, bindings);
    const listings = await client.getListings();
    const stats = await client.getMarketStats();

    expect(listings.map((listing) => listing.tokenId)).toEqual([2n, 7n]);
    expect(stats.floorPrice).toBe(parseEther("0.08"));
    expect(stats.maxPrice).toBe(parseEther("0.1"));
    expect(stats.listingCount).toBe(2);
  });

  it("blocks stale listing in buy preflight", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(config, bindings);

    const action: PreflightAction = {
      type: "buy",
      tokenId: 1n,
      price: parseEther("0.09"),
      expectedSeller: "0x00000000000000000000000000000000000000BB",
    };

    const preflight = await client.preflightAction(action);

    expect(preflight.ok).toBe(false);
    expect(preflight.blockers.join(" ")).toMatch(/seller changed/i);
  });

  it("uses primary price for mint and forwards write actions", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(config, bindings);

    await client.mintPrimary();
    await client.approveTicket(9n);
    await client.listTicket(9n, parseEther("0.08"));
    await client.listTicketWithPermit?.(10n, parseEther("0.07"));
    await client.buyTicket(4n, parseEther("0.09"));

    expect(bindings.ticket.mintPrimary).toHaveBeenCalledWith(parseEther("0.1"));
    expect(bindings.ticket.approve).toHaveBeenCalledWith(config.marketplaceAddress, 9n);
    expect(bindings.marketplace.list).toHaveBeenCalledWith(9n, parseEther("0.08"));
    expect(bindings.marketplace.listWithPermit).toHaveBeenCalledWith(10n, parseEther("0.07"));
    expect(bindings.marketplace.buy).toHaveBeenCalledWith(4n, parseEther("0.09"));
  });

  it("returns preview-ready base uris in system state", async () => {
    const bindings = makeBaseBindings();
    const client = createChainTicketClientFromBindings(config, bindings);

    const systemState = await client.getSystemState();

    expect(systemState.baseTokenURI).toBe("ipfs://ticket/base/");
    expect(systemState.collectibleBaseURI).toBe("ipfs://ticket/collectible/");
  });

  it("keeps scanner-admin separate from governance admin in role detection", async () => {
    const bindings = makeBaseBindings();
    bindings.ticket.hasRole = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    bindings.checkInRegistry.hasRole = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    const client = createChainTicketClientFromBindings(config, bindings);
    const roles = await client.getUserRoles?.("0x00000000000000000000000000000000000000BB");

    expect(roles).toEqual({
      isAdmin: false,
      isScannerAdmin: true,
      isPauser: true,
      isScanner: true,
    });
  });

  it("keeps preflight blockers for mint/list/cancel scenarios", async () => {
    const bindings = makeBaseBindings();
    bindings.ticket.totalMinted = vi.fn().mockResolvedValue(100n);
    bindings.ticket.maxSupply = vi.fn().mockResolvedValue(100n);
    bindings.ticket.balanceOf = vi.fn().mockResolvedValue(2n);
    bindings.ticket.maxPerWallet = vi.fn().mockResolvedValue(2n);
    bindings.ticket.ownerOf = vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000CC");
    bindings.ticket.getApproved = vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000DD");
    bindings.ticket.isApprovedForAll = vi.fn().mockResolvedValue(false);
    bindings.checkInRegistry.isUsed = vi.fn().mockResolvedValue(true);
    bindings.marketplace.getListing = vi.fn().mockResolvedValue({
      seller: "0x0000000000000000000000000000000000000000",
      price: parseEther("0.09"),
    });

    const client = createChainTicketClientFromBindings(config, bindings);

    const mintPreflight = await client.preflightAction({ type: "mint" });
    expect(mintPreflight.blockers).toEqual(
      expect.arrayContaining(["Event is sold out.", "Wallet ticket limit reached."]),
    );

    const listPreflight = await client.preflightAction({
      type: "list",
      tokenId: 1n,
      price: parseEther("0.2"),
    });
    expect(listPreflight.blockers).toEqual(
      expect.arrayContaining([
        "Listing price exceeds primary cap.",
        "Only the owner can list this ticket.",
        "Marketplace approval missing for this token.",
        "Used tickets cannot be listed.",
      ]),
    );

    const listWithPermitPreflight = await client.preflightAction({
      type: "list_with_permit",
      tokenId: 1n,
      price: parseEther("0.2"),
    });
    expect(listWithPermitPreflight.blockers).toEqual(
      expect.arrayContaining([
        "Listing price exceeds primary cap.",
        "Only the owner can list this ticket.",
        "Used tickets cannot be listed.",
      ]),
    );
    expect(listWithPermitPreflight.blockers).not.toContain("Marketplace approval missing for this token.");

    const cancelPreflight = await client.preflightAction({
      type: "cancel",
      tokenId: 1n,
      expectedSeller: "0x00000000000000000000000000000000000000BB",
    });
    expect(cancelPreflight.blockers).toEqual(
      expect.arrayContaining(["Listing is already inactive."]),
    );
  });

  it("keeps timeline ordering, kinds, and timestamps stable", async () => {
    const bindings = makeBaseBindings();
    bindings.ticket.queryTransferEventsByToken = vi.fn().mockResolvedValue([
      {
        from: "0x0000000000000000000000000000000000000000",
        to: "0x00000000000000000000000000000000000000BB",
        tokenId: 5n,
        blockNumber: 8,
        logIndex: 0,
        txHash: "0xmint",
      },
      {
        from: "0x00000000000000000000000000000000000000BB",
        to: "0x00000000000000000000000000000000000000AA",
        tokenId: 5n,
        blockNumber: 10,
        logIndex: 3,
        txHash: "0xtransfer",
      },
    ]);
    bindings.marketplace.queryListedEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 5n,
        seller: "0x00000000000000000000000000000000000000AA",
        price: parseEther("0.08"),
        blockNumber: 11,
        logIndex: 2,
        txHash: "0xlisted",
      },
    ]);
    bindings.marketplace.queryCancelledEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 5n,
        actor: "0x00000000000000000000000000000000000000AA",
        blockNumber: 12,
        logIndex: 1,
        txHash: "0xcancelled",
      },
    ]);
    bindings.marketplace.querySoldEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 5n,
        seller: "0x00000000000000000000000000000000000000AA",
        buyer: "0x00000000000000000000000000000000000000DD",
        price: parseEther("0.08"),
        feeAmount: parseEther("0.004"),
        blockNumber: 13,
        logIndex: 1,
        txHash: "0xsold",
      },
    ]);
    bindings.checkInRegistry.queryUsedEvents = vi.fn().mockResolvedValue([
      {
        tokenId: 5n,
        scanner: "0x00000000000000000000000000000000000000EE",
        blockNumber: 14,
        logIndex: 0,
        txHash: "0xused",
      },
    ]);
    bindings.ticket.queryCollectibleModeEvents = vi.fn().mockResolvedValue([
      {
        enabled: true,
        blockNumber: 15,
        logIndex: 0,
        txHash: "0xcollectible",
      },
    ]);
    bindings.getBlockTimestamp = vi.fn().mockImplementation(async (blockNumber: number) => {
      return blockNumber * 100;
    });

    const client = createChainTicketClientFromBindings(config, bindings);
    const timeline = await client.getTicketTimeline(5n);

    expect(timeline.map((entry) => entry.kind)).toEqual([
      "collectible",
      "used",
      "sold",
      "cancelled",
      "listed",
      "transfer",
      "mint",
    ]);
    expect(timeline[0]?.timestamp).toBe(1500);
    expect(timeline[timeline.length - 1]?.timestamp).toBe(800);
    expect(timeline[0]?.description).toMatch(/Collectible mode enabled/i);
    expect(timeline[timeline.length - 1]?.description).toMatch(/Primary mint/i);
  });
});
