import { EventEmitter } from "node:events";

import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const repositoryMocks = vi.hoisted(() => ({
  getActiveListings: vi.fn(),
  getEventDeployments: vi.fn(),
  getIndexedBlock: vi.fn(),
  getMarketStats: vi.fn(),
  getOperationalSummary: vi.fn(),
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
  process.env.DEPLOYMENT_BLOCK = "100";
  process.env.TICKET_NFT_ADDRESS = "0x0000000000000000000000000000000000000011";
  process.env.MARKETPLACE_ADDRESS = "0x0000000000000000000000000000000000000022";
  process.env.CHECKIN_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000033";
  process.env.CORS_ORIGINS = "http://localhost:5173";
  process.env.RATE_LIMIT_MAX = "120";
  process.env.HEALTH_LAG_WARN_BLOCKS = "20";
  process.env.HEALTH_LAG_CRITICAL_BLOCKS = "60";
  process.env.HEALTH_STALL_WARN_MS = "60000";
  process.env.HEALTH_STALL_CRITICAL_MS = "180000";
  process.env.HEALTH_RATE_LIMIT_STREAK_WARN = "3";
}

class FakeIndexer extends EventEmitter {
  getDeploymentFloor() {
    return 100;
  }

  getStatus() {
    return {
      running: true,
      haltedByRateLimit: false,
      haltedReason: null,
      currentBatchSize: 64,
      currentBackoffMs: 0,
      consecutiveRateLimitErrors: 0,
      totalRateLimitErrors: 2,
      totalEventsProcessed: 17,
      totalMetadataRefreshes: 1,
      totalRangesProcessed: 4,
      totalReorgResets: 0,
      lastRateLimitAt: null,
      lastProcessedAt: Date.now() - 15_000,
      lastProcessedRangeFrom: 100,
      lastProcessedRangeTo: 120,
      lastProcessedDurationMs: 1800,
    };
  }

  async getLatestChainBlock() {
    return 150;
  }

  async getCurrentSystemState(_ticketEventId?: string) {
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
    repositoryMocks.getEventDeployments.mockResolvedValue([]);
    repositoryMocks.getOperationalSummary.mockResolvedValue({
      roles: [],
      recentActivity: [],
    });

    const { metrics } = await import("./metrics.js");
    metrics.reset();
  });

  it("serves JSON health and Prometheus metrics with request counters", async () => {
    const { createApp } = await import("./app.js");

    const app = createApp(new FakeIndexer() as never);

    const eventsResponse = await request(app).get("/v1/events");
    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.body).toEqual({
      defaultEventId: "main-event",
      items: [
        {
          ticketEventId: "main-event",
          name: "main-event",
          symbol: "CTK",
          primaryPriceWei: "0",
          maxSupply: "0",
          treasury: "",
          admin: "",
          ticketNftAddress: "0x0000000000000000000000000000000000000011",
          marketplaceAddress: "0x0000000000000000000000000000000000000022",
          checkInRegistryAddress: "0x0000000000000000000000000000000000000033",
            deploymentBlock: 100,
            registeredAt: 0,
          },
        ],
      });

    const opsResponse = await request(app).get("/v1/ops/summary");
    expect(opsResponse.status).toBe(200);
    expect(opsResponse.body).toEqual({
      ticketEventId: "main-event",
      roles: [],
      recentActivity: [],
    });

    const healthResponse = await request(app).get("/v1/health");
    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toMatchObject({
      ok: true,
      degraded: true,
      indexedBlock: 120,
      latestBlock: 150,
      lag: 30,
      rpcHealthy: true,
      readModelReady: true,
      configuredDeploymentBlock: 100,
    });
    expect(healthResponse.body.stalenessMs).toBeTypeOf("number");
    expect(healthResponse.body.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "indexer_lag",
          severity: "warning",
        }),
      ]),
    );
    expect(healthResponse.body.indexer.totalRateLimitErrors).toBe(2);
    expect(healthResponse.body.indexer.totalRangesProcessed).toBe(4);

    const metricsResponse = await request(app).get("/v1/metrics");
    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.headers["content-type"]).toContain("text/plain");
    expect(metricsResponse.text).toContain("chainticket_indexer_lag_blocks 30");
    expect(metricsResponse.text).toContain("chainticket_indexer_rate_limit_errors_total 2");
    expect(metricsResponse.text).toContain("chainticket_health_degraded 1");
    expect(metricsResponse.text).toContain('chainticket_health_alert_active{code="indexer_lag",severity="warning"} 1');
    expect(metricsResponse.text).toContain('chainticket_http_request_duration_ms_bucket{method="GET",path="/v1/health",status="200",le="50"}');
    expect(metricsResponse.text).toContain(
      'chainticket_http_requests_total{method="GET",path="/v1/health",status="200"} 1',
    );
  });

  it("reports readModelReady false until the cursor reaches the configured deployment block", async () => {
    repositoryMocks.getIndexedBlock.mockResolvedValue(90);

    class NearDeploymentIndexer extends FakeIndexer {
      override async getLatestChainBlock() {
        return 100;
      }
    }

    const { createApp } = await import("./app.js");
    const app = createApp(new NearDeploymentIndexer() as never);

    const healthResponse = await request(app).get("/v1/health");

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.body).toMatchObject({
      ok: true,
      degraded: false,
      indexedBlock: 99,
      latestBlock: 100,
      lag: 1,
      readModelReady: false,
      configuredDeploymentBlock: 100,
    });
  });

  it("bypasses the global rate limit for health/system/events and caches system snapshots briefly", async () => {
    process.env.RATE_LIMIT_MAX = "1";

    class CachedIndexer extends FakeIndexer {
      readonly getCurrentSystemStateSpy = vi.fn(async (_ticketEventId?: string) => ({
        primaryPriceWei: "100000000000000000",
        maxSupply: "100",
        totalMinted: "12",
        maxPerWallet: "2",
        paused: false,
        collectibleMode: false,
      }));

      override async getCurrentSystemState(ticketEventId?: string) {
        return this.getCurrentSystemStateSpy(ticketEventId);
      }
    }

    const { createApp } = await import("./app.js");
    const indexer = new CachedIndexer();
    const app = createApp(indexer as never);

    const firstSystem = await request(app).get("/v1/system");
    const secondSystem = await request(app).get("/v1/system");
    const firstHealth = await request(app).get("/v1/health");
    const secondHealth = await request(app).get("/v1/health");
    const firstEvents = await request(app).get("/v1/events");
    const secondEvents = await request(app).get("/v1/events");
    const firstOps = await request(app).get("/v1/ops/summary");
    const secondOps = await request(app).get("/v1/ops/summary");

    expect(firstSystem.status).toBe(200);
    expect(secondSystem.status).toBe(200);
    expect(firstHealth.status).toBe(200);
    expect(secondHealth.status).toBe(200);
    expect(firstEvents.status).toBe(200);
    expect(secondEvents.status).toBe(200);
    expect(firstOps.status).toBe(200);
    expect(secondOps.status).toBe(429);
    expect(indexer.getCurrentSystemStateSpy).toHaveBeenCalledTimes(1);
  });
});
