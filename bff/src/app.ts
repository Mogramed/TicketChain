import cors from "cors";
import { Contract, JsonRpcProvider } from "ethers";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { FACTORY_ABI } from "./abi.js";
import { config } from "./config.js";
import { mergeDemoCatalogEntries } from "./demoCatalog.js";
import {
  buildDemoTicketMetadata,
  buildDemoTicketSvg,
  isDemoAssetVariant,
} from "./demoAssets.js";
import { logger, requestLogger } from "./logger.js";
import {
  getActiveListings,
  getDemoCatalogEntries,
  getEventDeployments as getStoredEventDeployments,
  getIndexedBlock,
  getMarketStats,
  getOperationalSummary,
  getTicketTimeline,
  getTicketsByOwner,
} from "./repository.js";
import {
  addressParamSchema,
  eventQuerySchema,
  listingsQuerySchema,
  tokenIdParamSchema,
} from "./validators.js";
import type { ChainIndexer, IndexerStatus } from "./indexer.js";
import { metrics } from "./metrics.js";
import type { ChainEventPayload, TicketEventDeployment } from "./types.js";

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

type HealthAlertSeverity = "warning" | "critical";

interface HealthAlert {
  code: string;
  severity: HealthAlertSeverity;
  message: string;
}

function buildHealthAlerts(input: {
  indexedBlock: number;
  latestBlock: number | null;
  rpcHealthy: boolean;
  indexerStatus: IndexerStatus;
  checkedAt: number;
  configuredDeploymentBlock: number;
}): {
  lag: number | null;
  stalenessMs: number | null;
  alerts: HealthAlert[];
  degraded: boolean;
  ok: boolean;
  readModelReady: boolean;
} {
  const alerts: HealthAlert[] = [];
  const lag =
    input.latestBlock === null ? null : Math.max(0, input.latestBlock - input.indexedBlock);
  const stalenessMs =
    input.indexerStatus.lastProcessedAt === null
      ? null
      : Math.max(0, input.checkedAt - input.indexerStatus.lastProcessedAt);

  if (!input.rpcHealthy) {
    alerts.push({
      code: "rpc_unhealthy",
      severity: "critical",
      message: "Latest RPC health probe failed.",
    });
  }

  if (input.indexerStatus.haltedByRateLimit) {
    alerts.push({
      code: "indexer_halted",
      severity: "critical",
      message:
        input.indexerStatus.haltedReason ??
        "Indexer halted after repeated RPC rate limiting.",
    });
  }

  if (lag !== null) {
    if (lag >= config.healthLagCriticalBlocks) {
      alerts.push({
        code: "indexer_lag",
        severity: "critical",
        message: `Indexer lag is ${lag} blocks, above the critical threshold of ${config.healthLagCriticalBlocks}.`,
      });
    } else if (lag >= config.healthLagWarnBlocks) {
      alerts.push({
        code: "indexer_lag",
        severity: "warning",
        message: `Indexer lag is ${lag} blocks, above the warning threshold of ${config.healthLagWarnBlocks}.`,
      });
    }
  }

  if (input.indexerStatus.consecutiveRateLimitErrors >= config.healthRateLimitStreakWarn) {
    alerts.push({
      code: "rate_limit_streak",
      severity: "warning",
      message: `Indexer has ${input.indexerStatus.consecutiveRateLimitErrors} consecutive RPC rate-limit errors.`,
    });
  }

  if (lag !== null && lag > 0 && input.indexerStatus.running) {
    if (stalenessMs === null) {
      alerts.push({
        code: "indexer_stalled",
        severity: "warning",
        message: "Indexer has lag but no successful block range has been processed yet.",
      });
    } else if (stalenessMs >= config.healthStallCriticalMs) {
      alerts.push({
        code: "indexer_stalled",
        severity: "critical",
        message: `Indexer has not completed a range for ${stalenessMs} ms, above the critical threshold of ${config.healthStallCriticalMs} ms.`,
      });
    } else if (stalenessMs >= config.healthStallWarnMs) {
      alerts.push({
        code: "indexer_stalled",
        severity: "warning",
        message: `Indexer has not completed a range for ${stalenessMs} ms, above the warning threshold of ${config.healthStallWarnMs} ms.`,
      });
    }
  }

  const degraded = alerts.length > 0;
  const ok = !alerts.some((alert) => alert.severity === "critical");
  const readModelReady =
    input.rpcHealthy && ok && input.indexedBlock >= input.configuredDeploymentBlock;

  return { lag, stalenessMs, alerts, degraded, ok, readModelReady };
}

function timelineDescription(row: {
  event_type: string;
  actor_from: string | null;
  actor_to: string | null;
  seller: string | null;
  buyer: string | null;
  scanner: string | null;
  collectible_enabled: boolean | null;
  price_wei: string | null;
}): string {
  switch (row.event_type) {
    case "transfer":
      if ((row.actor_from ?? "").toLowerCase() === "0x0000000000000000000000000000000000000000") {
        return `Primary mint to ${row.actor_to ?? "unknown"}`;
      }
      return `Transfer from ${row.actor_from ?? "unknown"} to ${row.actor_to ?? "unknown"}`;
    case "listed":
      return `Listed by ${row.seller ?? "unknown"} at ${row.price_wei ?? "0"} wei`;
    case "cancelled":
      return "Listing cancelled";
    case "sold":
      return `Sold from ${row.seller ?? "unknown"} to ${row.buyer ?? "unknown"}`;
    case "used":
      return `Checked-in by scanner ${row.scanner ?? "unknown"}`;
    case "collectible_mode":
      return row.collectible_enabled ? "Collectible mode enabled" : "Collectible mode disabled";
    default:
      return "Event";
  }
}

function timelineKind(row: { event_type: string; actor_from: string | null }):
  | "mint"
  | "transfer"
  | "listed"
  | "cancelled"
  | "sold"
  | "used"
  | "collectible" {
  if (row.event_type === "transfer") {
    if ((row.actor_from ?? "").toLowerCase() === "0x0000000000000000000000000000000000000000") {
      return "mint";
    }
    return "transfer";
  }

  if (row.event_type === "listed") {
    return "listed";
  }
  if (row.event_type === "cancelled") {
    return "cancelled";
  }
  if (row.event_type === "sold") {
    return "sold";
  }
  if (row.event_type === "used") {
    return "used";
  }
  return "collectible";
}

function parseFactoryDeployment(raw: unknown): TicketEventDeployment {
  const value = raw as {
    eventId?: unknown;
    name?: unknown;
    symbol?: unknown;
    primaryPrice?: unknown;
    maxSupply?: unknown;
    treasury?: unknown;
    admin?: unknown;
    ticketNFT?: unknown;
    marketplace?: unknown;
    checkInRegistry?: unknown;
    deploymentBlock?: unknown;
    registeredAt?: unknown;
  } & unknown[];

  return {
    ticketEventId: String(value.eventId ?? value[0] ?? ""),
    name: String(value.name ?? value[1] ?? ""),
    symbol: String(value.symbol ?? value[2] ?? ""),
    primaryPriceWei: String(value.primaryPrice ?? value[3] ?? "0"),
    maxSupply: String(value.maxSupply ?? value[4] ?? "0"),
    treasury: String(value.treasury ?? value[5] ?? ""),
    admin: String(value.admin ?? value[6] ?? ""),
    ticketNftAddress: String(value.ticketNFT ?? value[7] ?? ""),
    marketplaceAddress: String(value.marketplace ?? value[8] ?? ""),
    checkInRegistryAddress: String(value.checkInRegistry ?? value[9] ?? ""),
    deploymentBlock: Number(value.deploymentBlock ?? value[10] ?? 0),
    registeredAt: Number(value.registeredAt ?? value[11] ?? 0),
  };
}

export function createApp(indexer: ChainIndexer) {
  const app = express();
  const allowedOrigins = new Set(config.corsOrigins);
  const exemptFromGlobalRateLimit = new Set([
    "/v1/health",
    "/v1/system",
    "/v1/events",
    "/v1/events/stream",
  ]);
  const catalogProvider = new JsonRpcProvider(config.rpcUrl, config.chainId);
  const factoryContract = config.factoryAddress
    ? new Contract(config.factoryAddress, FACTORY_ABI, catalogProvider)
    : null;
  let catalogCache: { items: TicketEventDeployment[]; cachedAt: number } | null = null;
  type SystemStatePayload = Awaited<ReturnType<ChainIndexer["getCurrentSystemState"]>> & {
    ticketEventId: string;
  };
  const systemStateCache = new Map<string, { value: SystemStatePayload; cachedAt: number }>();

  const getFactoryCatalog = async (): Promise<TicketEventDeployment[]> => {
    if (!factoryContract) {
      return [];
    }

    const totalEvents = Number(await factoryContract.totalEvents());
    const rawDeployments = await Promise.all(
      Array.from({ length: totalEvents }, async (_value, index) =>
        factoryContract.getEventAt(index),
      ),
    );
    return rawDeployments.map((raw) => parseFactoryDeployment(raw));
  };

  const getEventCatalog = async (): Promise<TicketEventDeployment[]> => {
    if (catalogCache && Date.now() - catalogCache.cachedAt < 30_000) {
      return catalogCache.items;
    }

    let items = await getStoredEventDeployments();
    const activeDemoEntries = await getDemoCatalogEntries("active");
    const missingActiveDeployments =
      activeDemoEntries.length > 0 &&
      activeDemoEntries.some(
        (entry) => !items.some((item) => item.ticketEventId === entry.ticketEventId),
      );

    if (factoryContract && (items.length === 0 || missingActiveDeployments)) {
      try {
        const factoryItems = await getFactoryCatalog();

        if (items.length === 0) {
          items = factoryItems;
        } else {
          const byId = new Map(items.map((item) => [item.ticketEventId, item] as const));
          for (const deployment of factoryItems) {
            if (!byId.has(deployment.ticketEventId)) {
              byId.set(deployment.ticketEventId, deployment);
            }
          }
          items = [...byId.values()];
        }
      } catch (error) {
        logger.warn(
          {
            error: normalizeError(error),
            storedCount: items.length,
            activeDemoCount: activeDemoEntries.length,
            usedCatalogCacheFallback: Boolean(catalogCache),
          },
          "Falling back to stored event catalog after factory lookup failed.",
        );

        if (items.length === 0 && catalogCache) {
          return catalogCache.items;
        }
      }
    }

    if (items.length === 0) {
      items = [
        {
          ticketEventId: config.defaultEventId,
          name: config.defaultEventId,
          symbol: "CTK",
          primaryPriceWei: "0",
          maxSupply: "0",
          treasury: "",
          admin: "",
          ticketNftAddress: config.ticketNftAddress ?? "",
          marketplaceAddress: config.marketplaceAddress ?? "",
          checkInRegistryAddress: config.checkInRegistryAddress ?? "",
          deploymentBlock: config.deploymentBlock,
          registeredAt: 0,
        },
      ];
    }
    items = mergeDemoCatalogEntries(items, activeDemoEntries);

    catalogCache = {
      items,
      cachedAt: Date.now(),
    };
    return items;
  };

  const getIndexerHealth = async (): Promise<{
    checkedAt: number;
    indexedBlock: number;
    latestBlock: number | null;
    rpcHealthy: boolean;
    indexerStatus: IndexerStatus;
    configuredDeploymentBlock: number;
  }> => {
    const indexerStatus = indexer.getStatus();
    const configuredDeploymentBlock = indexer.getDeploymentFloor();
    const indexedBlock = Math.max(
      await getIndexedBlock(),
      configuredDeploymentBlock - 1,
    );
    let latestBlock: number | null = null;
    let rpcHealthy = true;
    const checkedAt = Date.now();

    try {
      latestBlock = await indexer.getLatestChainBlock();
    } catch {
      rpcHealthy = false;
    }

    return {
      checkedAt,
      indexedBlock,
      latestBlock,
      rpcHealthy,
      indexerStatus,
      configuredDeploymentBlock,
    };
  };

  const getSystemStateSnapshot = async (ticketEventId: string): Promise<SystemStatePayload> => {
    const cached = systemStateCache.get(ticketEventId);
    if (cached && Date.now() - cached.cachedAt < 1_000) {
      return cached.value;
    }

    const nextValue: SystemStatePayload = {
      ticketEventId,
      ...(await indexer.getCurrentSystemState(ticketEventId)),
    };
    systemStateCache.set(ticketEventId, {
      value: nextValue,
      cachedAt: Date.now(),
    });

    return nextValue;
  };

  const resolveTicketEventId = async (requested?: string): Promise<string> => {
    const catalog = await getEventCatalog();
    if (catalog.length === 0) {
      throw new Error("No ticket events are available.");
    }

    if (requested) {
      if (!catalog.some((item) => item.ticketEventId === requested)) {
        throw new Error(`Unknown ticket event id: ${requested}`);
      }
      return requested;
    }

    return (
      catalog.find((item) => item.ticketEventId === config.defaultEventId)?.ticketEventId ??
      catalog[0]?.ticketEventId ??
      config.defaultEventId
    );
  };

  const resolveDemoAssetRequest = async (params: {
    ticketEventId: string;
    tokenId: string;
    variant: string;
  }): Promise<{
    event: TicketEventDeployment;
    tokenId: bigint;
    variant: "live" | "collectible";
  }> => {
    if (!isDemoAssetVariant(params.variant)) {
      throw new Error(`Unsupported demo asset variant: ${params.variant}`);
    }

    if (!/^\d+$/.test(params.tokenId)) {
      throw new Error(`Invalid tokenId: ${params.tokenId}`);
    }

    const catalog = await getEventCatalog();
    const event = catalog.find((item) => item.ticketEventId === params.ticketEventId);
    if (!event) {
      throw new Error(`Unknown ticket event id: ${params.ticketEventId}`);
    }
    if (!event.isDemoInspired) {
      throw new Error(`Demo assets are only available for demo-inspired events: ${params.ticketEventId}`);
    }

    const tokenId = BigInt(params.tokenId);
    const maxSupply = BigInt(event.maxSupply || "0");
    if (tokenId < 0n) {
      throw new Error(`tokenId must be greater than or equal to 0 for ${params.ticketEventId}`);
    }
    if (maxSupply > 0n && tokenId > maxSupply) {
      throw new Error(
        `tokenId ${params.tokenId} is outside the max supply for ${params.ticketEventId}`,
      );
    }

    return {
      event,
      tokenId,
      variant: params.variant,
    };
  };

  app.set("trust proxy", 1);
  app.use(requestLogger);
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, true);
          return;
        }

        if (allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin not allowed by CORS"));
      },
      methods: ["GET"],
      credentials: false,
    }),
  );
  app.use(
    helmet({
      // This service is API-only; a document-level CSP belongs on the frontend origin.
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (request) =>
        request.method === "GET" &&
        exemptFromGlobalRateLimit.has(request.path),
    }),
  );
  app.use(express.json({ limit: "64kb" }));

  app.get("/demo-assets/:ticketEventId/:variant/:tokenId.json", async (request, response, next) => {
    try {
      const asset = await resolveDemoAssetRequest({
        ticketEventId: request.params.ticketEventId ?? "",
        tokenId: request.params.tokenId ?? "",
        variant: request.params.variant ?? "",
      });
      const origin = `${request.protocol}://${request.get("host") ?? `localhost:${config.port}`}`;

      response.setHeader("Content-Type", "application/json; charset=utf-8");
      response.setHeader("Cache-Control", "public, max-age=60");
      response.json(
        buildDemoTicketMetadata({
          event: asset.event,
          tokenId: asset.tokenId,
          variant: asset.variant,
          origin,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/demo-assets/:ticketEventId/:variant/:tokenId.svg", async (request, response, next) => {
    try {
      const asset = await resolveDemoAssetRequest({
        ticketEventId: request.params.ticketEventId ?? "",
        tokenId: request.params.tokenId ?? "",
        variant: request.params.variant ?? "",
      });

      response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      response.setHeader("Cache-Control", "public, max-age=60");
      response.send(
        buildDemoTicketSvg({
          event: asset.event,
          tokenId: asset.tokenId,
          variant: asset.variant,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/health", async (_request, response, next) => {
    try {
      const {
        checkedAt,
        indexerStatus,
        indexedBlock,
        latestBlock,
        rpcHealthy,
        configuredDeploymentBlock,
      } =
        await getIndexerHealth();
      const health = buildHealthAlerts({
        checkedAt,
        indexedBlock,
        latestBlock,
        rpcHealthy,
        indexerStatus,
        configuredDeploymentBlock,
      });

      response.json({
        ok: health.ok,
        degraded: health.degraded,
        checkedAt,
        indexedBlock,
        latestBlock,
        lag: health.lag,
        stalenessMs: health.stalenessMs,
        rpcHealthy,
        readModelReady: health.readModelReady,
        configuredDeploymentBlock,
        alerts: health.alerts,
        indexer: indexerStatus,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/metrics", async (_request, response, next) => {
    try {
      const {
        checkedAt,
        indexerStatus,
        indexedBlock,
        latestBlock,
        rpcHealthy,
        configuredDeploymentBlock,
      } =
        await getIndexerHealth();
      const health = buildHealthAlerts({
        checkedAt,
        indexedBlock,
        latestBlock,
        rpcHealthy,
        indexerStatus,
        configuredDeploymentBlock,
      });
      response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      response.send(
        metrics.renderPrometheus({
          indexedBlock,
          latestBlock,
          rpcHealthy,
          healthOk: health.ok,
          degraded: health.degraded,
          stalenessMs: health.stalenessMs,
          alerts: health.alerts,
          indexer: indexerStatus,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/system", async (request, response, next) => {
    try {
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const system = await getSystemStateSnapshot(ticketEventId);
      response.json(system);
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/events", async (_request, response, next) => {
    try {
      const items = await getEventCatalog();
      const defaultEventId =
        items.find((item) => item.ticketEventId === config.defaultEventId)?.ticketEventId ??
        items[0]?.ticketEventId ??
        config.defaultEventId;
      response.json({
        items,
        defaultEventId,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/ops/summary", async (request, response, next) => {
    try {
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const summary = await getOperationalSummary(ticketEventId);
      response.json({
        ticketEventId,
        roles: summary.roles.map((role) => ({
          ticketEventId: role.ticketEventId,
          contractScope: role.contractScope,
          roleId: role.roleId,
          account: role.account,
          grantedBy: role.grantedBy,
          isActive: role.isActive,
          updatedBlock: role.updatedBlock,
          updatedTxHash: role.updatedTxHash,
        })),
        recentActivity: summary.recentActivity.map((activity) => ({
          id: activity.id,
          ticketEventId: activity.ticketEventId,
          contractScope: activity.contractScope,
          type: activity.type,
          roleId: activity.roleId ?? null,
          account: activity.account ?? null,
          actor: activity.actor ?? null,
          blockNumber: activity.blockNumber,
          txHash: activity.txHash,
          timestamp: activity.timestamp,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/listings", async (request, response, next) => {
    try {
      const query = listingsQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const result = await getActiveListings({
        ticketEventId,
        sort: query.sort,
        limit: query.limit,
        offset: query.offset,
      });
      response.json({
        ticketEventId,
        items: result.items.map((item) => ({
          ticketEventId: item.ticket_event_id,
          tokenId: item.token_id,
          seller: item.seller,
          priceWei: item.price_wei,
          isActive: item.is_active,
          updatedBlock: Number(item.updated_block),
        })),
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
        sort: query.sort,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/market/stats", async (_request, response, next) => {
    try {
      const query = eventQuerySchema.parse(_request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const stats = await getMarketStats(ticketEventId);
      response.json({
        ticketEventId,
        ...stats,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/users/:address/tickets", async (request, response, next) => {
    try {
      const params = addressParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const tickets = await getTicketsByOwner(params.address, ticketEventId);
      response.json({
        ticketEventId,
        address: params.address,
        items: tickets.map((ticket) => ({
          ticketEventId: ticket.ticket_event_id,
          tokenId: ticket.token_id,
          owner: ticket.owner,
          used: ticket.used,
          tokenURI: ticket.token_uri,
          listed: ticket.listed,
          listingPriceWei: ticket.listing_price_wei,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/tickets/:tokenId/timeline", async (request, response, next) => {
    try {
      const params = tokenIdParamSchema.parse(request.params);
      const query = eventQuerySchema.parse(request.query);
      const ticketEventId = await resolveTicketEventId(query.eventId);
      const rows = await getTicketTimeline(params.tokenId, ticketEventId);
      response.json({
        ticketEventId,
        tokenId: params.tokenId,
        items: rows.map((row) => ({
          id: row.chain_event_id,
          tokenId: row.token_id ?? params.tokenId,
          kind: timelineKind(row),
          blockNumber: Number(row.block_number),
          txHash: row.tx_hash,
          timestamp: row.block_timestamp ? Number(row.block_timestamp) : null,
          description: timelineDescription(row),
          from: row.actor_from ?? undefined,
          to: row.actor_to ?? undefined,
          seller: row.seller ?? undefined,
          buyer: row.buyer ?? undefined,
          scanner: row.scanner ?? undefined,
          priceWei: row.price_wei ?? undefined,
          feeAmountWei: row.fee_amount_wei ?? undefined,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/events/stream", (request, response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();
    metrics.incrementSseClients();

    const streamQuery = eventQuerySchema.safeParse(request.query);
    const requestedTicketEventId = streamQuery.success ? streamQuery.data.eventId : undefined;

    const send = (event: ChainEventPayload) => {
      if (requestedTicketEventId && event.ticketEventId !== requestedTicketEventId) {
        return;
      }
      metrics.recordSseEvent();
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    metrics.recordSseEvent();
    response.write(`data: ${JSON.stringify({ type: "hello", ts: Date.now() })}\n\n`);
    indexer.on("event", send);

    const keepAlive = setInterval(() => {
      response.write(`: keepalive ${Date.now()}\n\n`);
    }, 15_000);

    request.on("close", () => {
      clearInterval(keepAlive);
      indexer.off("event", send);
      metrics.decrementSseClients();
      response.end();
    });
  });

  app.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    const message = normalizeError(error);
    const requestId = response.getHeader("x-request-id");
    logger.error(
      {
        requestId,
        method: request.method,
        path: request.path,
        error: message,
      },
      "Request failed.",
    );

    response.status(400).json({
      error: message,
      requestId,
    });
  });

  return app;
}
