import { beforeEach, describe, expect, it, vi } from "vitest";

function applyBaseEnv(): void {
  process.env.NODE_ENV = "test";
  delete process.env.BFF_RUNTIME_MODE;
  process.env.PORT = "8787";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/chainticket_test";
  process.env.AMOY_RPC_URL = "https://rpc-amoy.polygon.technology";
  process.env.CHAIN_ID = "80002";
  process.env.DEFAULT_EVENT_ID = "main-event";
  process.env.TICKET_NFT_ADDRESS = "0x0000000000000000000000000000000000000011";
  process.env.MARKETPLACE_ADDRESS = "0x0000000000000000000000000000000000000022";
  process.env.CHECKIN_REGISTRY_ADDRESS = "0x0000000000000000000000000000000000000033";
  process.env.CORS_ORIGINS = "http://localhost:5173";
  process.env.RATE_LIMIT_MAX = "120";
}

describe("BFF config validation", () => {
  beforeEach(() => {
    vi.resetModules();
    applyBaseEnv();
  });

  it("rejects legacy single-event mode when DEPLOYMENT_BLOCK is not strictly positive", async () => {
    process.env.DEPLOYMENT_BLOCK = "0";

    await expect(import("./config.js")).rejects.toThrow(
      "DEPLOYMENT_BLOCK must be greater than 0 when legacy single-event contract addresses are configured.",
    );
  });

  it("allows catalog-only scripts to run without factory or legacy addresses", async () => {
    process.env.BFF_RUNTIME_MODE = "catalog-only";
    process.env.FACTORY_ADDRESS = "";
    process.env.TICKET_NFT_ADDRESS = "";
    process.env.MARKETPLACE_ADDRESS = "";
    process.env.CHECKIN_REGISTRY_ADDRESS = "";

    const { config } = await import("./config.js");

    expect(config.runtimeMode).toBe("catalog-only");
    expect(config.factoryAddress).toBeNull();
    expect(config.ticketNftAddress).toBeNull();
  });
});
