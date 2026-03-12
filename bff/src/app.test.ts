import { EventEmitter } from "node:events";

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  getActiveListings: vi.fn(),
  getIndexedBlock: vi.fn(),
  getMarketStats: vi.fn(),
  getTicketTimeline: vi.fn(),
  getTicketsByOwner: vi.fn(),
}));

vi.mock("./repository.js", () => repositoryMocks);

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
  process.env.CORS_ORIGINS = "http://localhost:5173";
  process.env.RATE_LIMIT_MAX = "120";
}

class FakeIndexer extends EventEmitter {
  getStatus() {
    return {
      running: true,
      haltedByRateLimit: false,
      haltedReason: null,
      currentBatchSize: 64,
      consecutiveRateLimitErrors: 0,
      totalRateLimitErrors: 2,
      totalEventsProcessed: 17,
      totalMetadataRefreshes: 1,
    };
  }

  async getLatestChainBlock() {
    return 150;
  }

  async getCurrentSystemState() {
    return {
      primaryPriceWei: "100000000000000000",
      maxSupply: "100",
      totalMinted: "12",
      maxPerWallet: "2",
      paused: false,
      collectibleMode: false,
    };
  }
}

describe("createApp", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    applyBffEnv();
    repositoryMocks.getIndexedBlock.mockResolvedValue(120);

    const { metrics } = await import("./metrics.js");
    metrics.reset();
  });

  it("serves JSON health and Prometheus metrics with request counters", async () => {
    const { createApp } = await import("./app.js");

    const app = createApp(new FakeIndexer() as never);

    const healthResponse = await request(app).get("/v1/health");
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toMatchObject({
      ok: true,
      indexedBlock: 120,
      latestBlock: 150,
      lag: 30,
      rpcHealthy: true,
    });
    expect(healthResponse.body.indexer.totalRateLimitErrors).toBe(2);

    const metricsResponse = await request(app).get("/v1/metrics");
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.headers["content-type"]).toContain("text/plain");
    expect(metricsResponse.text).toContain("chainticket_indexer_lag_blocks 30");
    expect(metricsResponse.text).toContain("chainticket_indexer_rate_limit_errors_total 2");
    expect(metricsResponse.text).toContain(
      'chainticket_http_requests_total{method="GET",path="/v1/health",status="200"} 1',
    );
  });
});
