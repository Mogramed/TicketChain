import { beforeEach, describe, expect, it, vi } from "vitest";

function applyBffEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.PORT = "8787";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/chainticket_test";
  process.env.AMOY_RPC_URL = "https://rpc-amoy.polygon.technology";
  process.env.CHAIN_ID = "80002";
  process.env.DEPLOYMENT_BLOCK = "0";
  process.env.TICKET_NFT_ADDRESS = "0x0000000000000000000000000000000000000011";
  process.env.MARKETPLACE_ADDRESS = "0x0000000000000000000000000000000000000022";
  process.env.CHECKIN_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000033";
}

describe("ChainIndexer.applyEvent", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
  });

  it("keeps the existing owner when a used event is applied", async () => {
    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      applyEvent: (
        client: { query: (...args: unknown[]) => Promise<{ rowCount: number }> },
        event: Record<string, unknown>,
        tokenUriMap: Map<string, string>,
      ) => Promise<void>;
    };

    const client = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    };

    await indexer.applyEvent(
      client,
      {
        id: "tx:1:used",
        type: "used",
        tokenId: 7n,
        scanner: "0x00000000000000000000000000000000000000bb",
        blockNumber: 42,
        logIndex: 1,
        txHash: "0xused",
        timestamp: 1_700_000_000,
      },
      new Map(),
    );

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE ticket_state"),
      ["7", 42, "0xused"],
    );
  });

  it("falls back to on-chain owner data if a used ticket was never materialized locally", async () => {
    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      applyEvent: (
        client: { query: (...args: unknown[]) => Promise<{ rowCount: number }> },
        event: Record<string, unknown>,
        tokenUriMap: Map<string, string>,
      ) => Promise<void>;
      ticketContract: {
        ownerOf: (tokenId: bigint) => Promise<string>;
        tokenURI: (tokenId: bigint) => Promise<string>;
      };
    };

    indexer.ticketContract = {
      ownerOf: vi.fn().mockResolvedValue("0x00000000000000000000000000000000000000AA"),
      tokenURI: vi.fn().mockResolvedValue("ipfs://ticket/7.json"),
    };

    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rowCount: 1 }),
    };

    await indexer.applyEvent(
      client,
      {
        id: "tx:1:used",
        type: "used",
        tokenId: 7n,
        scanner: "0x00000000000000000000000000000000000000bb",
        blockNumber: 42,
        logIndex: 1,
        txHash: "0xused",
        timestamp: 1_700_000_000,
      },
      new Map(),
    );

    expect(indexer.ticketContract.ownerOf).toHaveBeenCalledWith(7n);
    expect(indexer.ticketContract.tokenURI).toHaveBeenCalledWith(7n);
    expect(client.query).toHaveBeenLastCalledWith(
      expect.stringContaining("INSERT INTO ticket_state"),
      [
        "7",
        "0x00000000000000000000000000000000000000aa",
        "ipfs://ticket/7.json",
        42,
        "0xused",
      ],
    );
  });
});
