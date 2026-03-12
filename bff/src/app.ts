import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import { config } from "./config.js";
import { logger, requestLogger } from "./logger.js";
import {
  getActiveListings,
  getIndexedBlock,
  getMarketStats,
  getTicketTimeline,
  getTicketsByOwner,
} from "./repository.js";
import { addressParamSchema, listingsQuerySchema, tokenIdParamSchema } from "./validators.js";
import type { ChainIndexer, IndexerStatus } from "./indexer.js";
import { metrics } from "./metrics.js";
import type { ChainEventPayload } from "./types.js";

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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

export function createApp(indexer: ChainIndexer) {
  const app = express();
  const allowedOrigins = new Set(config.corsOrigins);

  const getIndexerHealth = async (): Promise<{
    indexedBlock: number;
    latestBlock: number | null;
    rpcHealthy: boolean;
    indexerStatus: IndexerStatus;
  }> => {
    const indexerStatus = indexer.getStatus();
    const indexedBlock = await getIndexedBlock();
    let latestBlock: number | null = null;
    let rpcHealthy = true;

    try {
      latestBlock = await indexer.getLatestChainBlock();
    } catch {
      rpcHealthy = false;
    }

    return {
      indexedBlock,
      latestBlock,
      rpcHealthy,
      indexerStatus,
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
  app.use(helmet());
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: config.rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.use(express.json({ limit: "64kb" }));

  app.get("/v1/health", async (_request, response, next) => {
    try {
      const { indexerStatus, indexedBlock, latestBlock, rpcHealthy } = await getIndexerHealth();

      response.json({
        ok: rpcHealthy,
        indexedBlock,
        latestBlock,
        lag: latestBlock === null ? null : Math.max(0, latestBlock - indexedBlock),
        rpcHealthy,
        indexer: indexerStatus,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/metrics", async (_request, response, next) => {
    try {
      const { indexerStatus, indexedBlock, latestBlock, rpcHealthy } = await getIndexerHealth();
      response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      response.send(
        metrics.renderPrometheus({
          indexedBlock,
          latestBlock,
          rpcHealthy,
          indexer: indexerStatus,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/system", async (_request, response, next) => {
    try {
      const system = await indexer.getCurrentSystemState();
      response.json(system);
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/listings", async (request, response, next) => {
    try {
      const query = listingsQuerySchema.parse(request.query);
      const result = await getActiveListings(query);
      response.json({
        items: result.items.map((item) => ({
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
      const stats = await getMarketStats();
      response.json(stats);
    } catch (error) {
      next(error);
    }
  });

  app.get("/v1/users/:address/tickets", async (request, response, next) => {
    try {
      const params = addressParamSchema.parse(request.params);
      const tickets = await getTicketsByOwner(params.address);
      response.json({
        address: params.address,
        items: tickets.map((ticket) => ({
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
      const rows = await getTicketTimeline(params.tokenId);
      response.json({
        tokenId: params.tokenId,
        items: rows.map((row) => ({
          id: row.event_id,
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

    const send = (event: ChainEventPayload) => {
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
