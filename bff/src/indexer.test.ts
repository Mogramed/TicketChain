import { beforeEach, describe, expect, it, vi } from "vitest";

function applyBffEnv(): void {
  process.env.NODE_ENV = "test";
  process.env.PORT = "8787";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/chainticket_test";
  process.env.AMOY_RPC_URL = "https://rpc-amoy.polygon.technology";
  process.env.CHAIN_ID = "80002";
  process.env.DEPLOYMENT_BLOCK = "100";
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
        ticketEventId: "main-event",
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
      expect.stringContaining("UPDATE ticket_state_items"),
      ["main-event", "7", 42, "0xused"],
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
    (indexer as unknown as { contractSets: Map<string, unknown> }).contractSets = new Map([
      [
        "main-event",
        {
          ticketContract: indexer.ticketContract,
        },
      ],
    ]);

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
        ticketEventId: "main-event",
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
      expect.stringContaining("INSERT INTO ticket_state_items"),
      [
        "main-event",
        "7",
        "0x00000000000000000000000000000000000000aa",
        "ipfs://ticket/7.json",
        42,
        "0xused",
      ],
    );
  });
});

describe("ChainIndexer.applyOperationalActivity", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
  });

  it("materializes active role assignments from role grant activity", async () => {
    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      applyOperationalActivity: (
        client: { query: (...args: unknown[]) => Promise<{ rowCount: number }> },
        activity: Record<string, unknown>,
      ) => Promise<void>;
    };

    const client = {
      query: vi.fn().mockResolvedValue({ rowCount: 1 }),
    };

    await indexer.applyOperationalActivity(client, {
      id: "main-event:0xgrant:0:ticket:role_granted",
      ticketEventId: "main-event",
      contractScope: "ticket",
      type: "role_granted",
      roleId: "0xrole",
      account: "0x00000000000000000000000000000000000000aa",
      actor: "0x00000000000000000000000000000000000000bb",
      blockNumber: 42,
      logIndex: 0,
      txHash: "0xgrant",
      timestamp: 1_700_000_000,
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO role_state_items"),
      [
        "main-event",
        "ticket",
        "0xrole",
        "0x00000000000000000000000000000000000000aa",
        "0x00000000000000000000000000000000000000bb",
        true,
        42,
        "0xgrant",
      ],
    );
  });
});

describe("ChainIndexer log summaries", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
  });

  it("demotes repetitive empty ranges to debug and emits periodic info checkpoints", async () => {
    const { logger } = await import("./logger.js");
    const infoSpy = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const debugSpy = vi.spyOn(logger, "debug").mockImplementation(() => logger);
    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      logProcessedRangeSummary: (input: {
        fromBlock: number;
        toBlock: number;
        eventCount: number;
        operationalActivityCount: number;
        metadataRefreshCount: number;
        ticketEventIds: string[];
      }) => void;
    };

    for (let range = 0; range < 24; range += 1) {
      indexer.logProcessedRangeSummary({
        fromBlock: range * 120,
        toBlock: range * 120 + 119,
        eventCount: 0,
        operationalActivityCount: 0,
        metadataRefreshCount: 0,
        ticketEventIds: [],
      });
    }

    expect(debugSpy).toHaveBeenCalledTimes(24);
    expect(infoSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ emptyRangesSinceLastInfo: 25 }),
      "Indexer processed empty block ranges.",
    );

    indexer.logProcessedRangeSummary({
      fromBlock: 24 * 120,
      toBlock: 24 * 120 + 119,
      eventCount: 0,
      operationalActivityCount: 0,
      metadataRefreshCount: 0,
      ticketEventIds: [],
    });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fromBlock: 24 * 120,
        toBlock: 24 * 120 + 119,
        emptyRangesSinceLastInfo: 25,
      }),
      "Indexer processed empty block ranges.",
    );
  });
});

describe("ChainIndexer cursor reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
  });

  it("resets a stored cursor that predates the deployment floor", async () => {
    vi.doMock("./db.js", async () => {
      const actual = await vi.importActual<typeof import("./db.js")>("./db.js");
      return {
        ...actual,
        getChainStateNumber: vi.fn().mockResolvedValue(50),
      };
    });

    const { ChainIndexer } = await import("./indexer.js");
    const indexer = new ChainIndexer() as unknown as {
      contractSets: Map<string, { deployment: { deploymentBlock: number } }>;
      syncEventDeployments: (force?: boolean) => Promise<void>;
      resetToBlock: (lastIndexedBlock: number) => Promise<void>;
      loop: () => Promise<void>;
      start: () => Promise<void>;
    };

    indexer.syncEventDeployments = vi.fn(async () => {
      indexer.contractSets = new Map([
        [
          "main-event",
          {
            deployment: { deploymentBlock: 100 },
          },
        ],
      ]);
    });
    indexer.resetToBlock = vi.fn().mockResolvedValue(undefined);
    indexer.loop = vi.fn().mockResolvedValue(undefined);

    await indexer.start();

    expect(indexer.resetToBlock).toHaveBeenCalledWith(99);
  });
});
