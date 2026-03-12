import { EventEmitter } from "node:events";

import { Contract, JsonRpcProvider } from "ethers";
import type { PoolClient } from "pg";

import { CHECKIN_ABI, MARKETPLACE_ABI, TICKET_NFT_ABI } from "./abi.js";
import { config } from "./config.js";
import {
  getChainStateNumber,
  getChainStateString,
  pool,
  resetIndexedState,
  setChainStateNumber,
  setChainStateString,
  withTransaction,
} from "./db.js";
import { logger } from "./logger.js";
import type { ChainEventPayload, IndexedEvent } from "./types.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  return BigInt(String(value));
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function eventId(txHash: string, logIndex: number, type: string): string {
  return `${txHash}:${logIndex}:${type}`;
}

function asLogIndex(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  return Number(value ?? 0);
}

function getArgs(log: unknown): unknown[] {
  const candidate = log as { args?: unknown };
  if (Array.isArray(candidate.args)) {
    return [...candidate.args];
  }
  return [];
}

function getBlockNumber(log: unknown): number {
  const candidate = log as { blockNumber?: number };
  return Number(candidate.blockNumber ?? 0);
}

function getTxHash(log: unknown): string {
  const candidate = log as { transactionHash?: string };
  return String(candidate.transactionHash ?? "");
}

function getLogIndex(log: unknown): number {
  const candidate = log as { index?: number; logIndex?: number };
  return asLogIndex(candidate.index ?? candidate.logIndex ?? 0);
}

function normalizeErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (!error || typeof error !== "object") {
    return String(error);
  }

  const candidate = error as {
    shortMessage?: unknown;
    message?: unknown;
    code?: unknown;
    info?: {
      responseStatus?: unknown;
      responseBody?: unknown;
      error?: { message?: unknown };
    };
  };

  const values = [
    candidate.shortMessage,
    candidate.message,
    candidate.code,
    candidate.info?.responseStatus,
    candidate.info?.responseBody,
    candidate.info?.error?.message,
  ];

  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join(" | ");
}

function isRateLimitError(error: unknown): boolean {
  const message = normalizeErrorMessage(error).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("1015") ||
    message.includes("exceeded maximum retry limit")
  );
}

function randomJitter(maxMs: number): number {
  return Math.floor(Math.random() * Math.max(0, maxMs));
}

interface MetadataRefreshTrigger {
  blockNumber: number;
  logIndex: number;
  txHash: string;
  reason: "collectible_mode" | "base_uris";
}

export interface IndexerStatus {
  running: boolean;
  haltedByRateLimit: boolean;
  haltedReason: string | null;
  currentBatchSize: number;
  consecutiveRateLimitErrors: number;
  totalRateLimitErrors: number;
  totalEventsProcessed: number;
  totalMetadataRefreshes: number;
}

interface CachedSystemState {
  primaryPriceWei: string;
  maxSupply: string;
  totalMinted: string;
  maxPerWallet: string;
  paused: boolean;
  collectibleMode: boolean;
}

export class ChainIndexer extends EventEmitter {
  private readonly provider: JsonRpcProvider;
  private readonly ticketContract: Contract;
  private readonly marketplaceContract: Contract;
  private readonly checkInContract: Contract;

  private running = false;
  private loopPromise: Promise<void> | null = null;
  private currentBatchSize = config.indexerBatchSize;
  private consecutiveRateLimitErrors = 0;
  private haltedByRateLimit = false;
  private haltedReason: string | null = null;
  private totalRateLimitErrors = 0;
  private totalEventsProcessed = 0;
  private totalMetadataRefreshes = 0;
  private cachedSystemState: CachedSystemState | null = null;
  private cachedSystemStateAt = 0;

  constructor() {
    super();
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
    this.ticketContract = new Contract(
      config.ticketNftAddress,
      TICKET_NFT_ABI,
      this.provider,
    );
    this.marketplaceContract = new Contract(
      config.marketplaceAddress,
      MARKETPLACE_ABI,
      this.provider,
    );
    this.checkInContract = new Contract(
      config.checkInRegistryAddress,
      CHECKIN_ABI,
      this.provider,
    );
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.currentBatchSize = Math.max(
      config.indexerMinBatchSize,
      Math.min(config.indexerBatchSize, this.currentBatchSize),
    );
    this.consecutiveRateLimitErrors = 0;
    this.haltedByRateLimit = false;
    this.haltedReason = null;
    this.running = true;
    logger.info("Starting block indexer...");
    this.loopPromise = this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
    logger.info("Indexer stopped.");
  }

  async getLatestChainBlock(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  getStatus(): IndexerStatus {
    return {
      running: this.running,
      haltedByRateLimit: this.haltedByRateLimit,
      haltedReason: this.haltedReason,
      currentBatchSize: this.currentBatchSize,
      consecutiveRateLimitErrors: this.consecutiveRateLimitErrors,
      totalRateLimitErrors: this.totalRateLimitErrors,
      totalEventsProcessed: this.totalEventsProcessed,
      totalMetadataRefreshes: this.totalMetadataRefreshes,
    };
  }

  async getCurrentSystemState(): Promise<CachedSystemState> {
    const now = Date.now();
    if (this.cachedSystemState && now - this.cachedSystemStateAt < 20_000) {
      return this.cachedSystemState;
    }

    try {
      const [primaryPrice, maxSupply, totalMinted, maxPerWallet, paused, collectibleMode] =
        await Promise.all([
          this.ticketContract.primaryPrice(),
          this.ticketContract.maxSupply(),
          this.ticketContract.totalMinted(),
          this.ticketContract.maxPerWallet(),
          this.ticketContract.paused(),
          this.ticketContract.collectibleMode(),
        ]);

      const fresh: CachedSystemState = {
        primaryPriceWei: String(primaryPrice),
        maxSupply: String(maxSupply),
        totalMinted: String(totalMinted),
        maxPerWallet: String(maxPerWallet),
        paused: Boolean(paused),
        collectibleMode: Boolean(collectibleMode),
      };

      this.cachedSystemState = fresh;
      this.cachedSystemStateAt = now;
      return fresh;
    } catch (error) {
      if (this.cachedSystemState) {
        logger.warn(
          {
            error: normalizeErrorMessage(error),
            staleAgeMs: now - this.cachedSystemStateAt,
          },
          "Serving stale cached system state due to RPC error.",
        );
        return this.cachedSystemState;
      }
      throw error;
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const indexedBlock = await getChainStateNumber(
          "last_indexed_block",
          config.deploymentBlock - 1,
        );
        const latestBlock = await this.provider.getBlockNumber();
        const targetBlock = Math.max(
          config.deploymentBlock - 1,
          latestBlock - config.indexerConfirmations,
        );

        if (indexedBlock >= targetBlock) {
          await sleep(config.indexerPollIntervalMs);
          continue;
        }

        const nextFrom = indexedBlock + 1;
        const nextTo = Math.min(targetBlock, nextFrom + this.currentBatchSize - 1);

        await this.ensureNoReorg(indexedBlock, nextFrom);
        await this.processRange(nextFrom, nextTo);

        if (this.consecutiveRateLimitErrors > 0) {
          this.consecutiveRateLimitErrors = 0;
        }
        if (this.currentBatchSize < config.indexerBatchSize) {
          this.currentBatchSize = Math.min(config.indexerBatchSize, this.currentBatchSize + 25);
        }

        if (config.indexerInterBatchDelayMs > 0) {
          await sleep(config.indexerInterBatchDelayMs);
        }
      } catch (error) {
        if (isRateLimitError(error)) {
          this.consecutiveRateLimitErrors += 1;
          this.totalRateLimitErrors += 1;
          this.currentBatchSize = Math.max(
            config.indexerMinBatchSize,
            Math.floor(this.currentBatchSize / 2),
          );

          const backoffMs = Math.min(
            config.indexerMaxBackoffMs,
            config.indexerRateLimitCooldownMs *
              2 ** Math.min(this.consecutiveRateLimitErrors - 1, 7),
          );
          const delayWithJitter = backoffMs + randomJitter(1200);

          logger.warn(
            {
              consecutiveRateLimitErrors: this.consecutiveRateLimitErrors,
              nextDelayMs: delayWithJitter,
              currentBatchSize: this.currentBatchSize,
              error: normalizeErrorMessage(error),
            },
            "RPC rate limit detected. Applying backoff and shrinking batch size.",
          );

          if (
            config.indexerStopOnMaxRateLimit &&
            this.consecutiveRateLimitErrors >= config.indexerMaxConsecutiveRateLimits
          ) {
            this.haltedByRateLimit = true;
            this.haltedReason = `Stopped after ${this.consecutiveRateLimitErrors} consecutive RPC rate-limit errors.`;
            this.running = false;
            logger.error(
              {
                haltedReason: this.haltedReason,
                currentBatchSize: this.currentBatchSize,
              },
              "Indexer halted due to repeated rate limiting.",
            );
            this.emit("halted", {
              reason: this.haltedReason,
              at: Date.now(),
            });
            break;
          }

          await sleep(delayWithJitter);
          continue;
        }

        logger.error({ error }, "Indexer iteration failed.");
        await sleep(config.indexerPollIntervalMs);
      }
    }
  }

  private async ensureNoReorg(lastIndexed: number, nextFrom: number): Promise<void> {
    if (lastIndexed < config.deploymentBlock || nextFrom <= config.deploymentBlock) {
      return;
    }

    const expectedHash = await getChainStateString("last_indexed_hash");
    if (!expectedHash) {
      return;
    }

    const block = await this.provider.getBlock(nextFrom);
    if (!block) {
      return;
    }

    if (block.parentHash.toLowerCase() === expectedHash.toLowerCase()) {
      return;
    }

    logger.warn(
      {
        nextFrom,
        expectedParentHash: expectedHash,
        actualParentHash: block.parentHash,
      },
      "Reorg detected, resetting indexed state.",
    );

    await withTransaction(async (client) => {
      await resetIndexedState(client);
      await setChainStateNumber(client, "last_indexed_block", config.deploymentBlock - 1);
      await setChainStateString(client, "last_indexed_hash", ZERO_ADDRESS);
    });
  }

  private async processRange(fromBlock: number, toBlock: number): Promise<void> {
    const events = await this.collectEvents(fromBlock, toBlock);
    const tokenUriMap = await this.loadTokenUris(events);
    const metadataRefreshes = await this.collectMetadataRefreshes(fromBlock, toBlock);
    const metadataTokenUriMap =
      metadataRefreshes.length > 0
        ? await this.loadStoredTokenUris()
        : new Map<string, string>();
    const endBlock = await this.provider.getBlock(toBlock);

    await withTransaction(async (client) => {
      for (const event of events) {
        await this.insertEvent(client, event);
        await this.applyEvent(client, event, tokenUriMap);
      }

      if (metadataTokenUriMap.size > 0) {
        await this.applyTokenUriRefreshes(client, metadataTokenUriMap);
      }

      if (endBlock) {
        await client.query(
          `
            INSERT INTO processed_blocks (block_number, block_hash, parent_hash)
            VALUES ($1, $2, $3)
            ON CONFLICT (block_number) DO UPDATE
            SET block_hash = EXCLUDED.block_hash,
                parent_hash = EXCLUDED.parent_hash,
                processed_at = NOW()
          `,
          [toBlock, endBlock.hash, endBlock.parentHash],
        );
      }

      await setChainStateNumber(client, "last_indexed_block", toBlock);
      await setChainStateString(client, "last_indexed_hash", endBlock?.hash ?? ZERO_ADDRESS);
    });

    this.totalEventsProcessed += events.length;
    this.totalMetadataRefreshes += metadataRefreshes.length;

    for (const event of events) {
      const payload: ChainEventPayload = {
        type: event.type,
        tokenId: event.tokenId ? event.tokenId.toString() : undefined,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
      };
      this.emit("event", payload);
    }

    logger.info(
      {
        fromBlock,
        toBlock,
        eventCount: events.length,
        metadataRefreshCount: metadataRefreshes.length,
      },
      "Indexer processed block range.",
    );
  }

  private async collectEvents(fromBlock: number, toBlock: number): Promise<IndexedEvent[]> {
    const [transferLogs, listedLogs, cancelledLogs, soldLogs, usedLogs, collectibleLogs] =
      await Promise.all([
        this.ticketContract.queryFilter(this.ticketContract.filters.Transfer(), fromBlock, toBlock),
        this.marketplaceContract.queryFilter(this.marketplaceContract.filters.Listed(), fromBlock, toBlock),
        this.marketplaceContract.queryFilter(this.marketplaceContract.filters.Cancelled(), fromBlock, toBlock),
        this.marketplaceContract.queryFilter(this.marketplaceContract.filters.Sold(), fromBlock, toBlock),
        this.checkInContract.queryFilter(this.checkInContract.filters.TicketMarkedUsed(), fromBlock, toBlock),
        this.ticketContract.queryFilter(
          this.ticketContract.filters.CollectibleModeUpdated(),
          fromBlock,
          toBlock,
        ),
      ]);

    const events: IndexedEvent[] = [];

    for (const log of transferLogs) {
      const args = getArgs(log);
      const from = String(args?.[0] ?? ZERO_ADDRESS);
      const to = String(args?.[1] ?? ZERO_ADDRESS);
      const tokenId = toBigInt(args?.[2] ?? 0n);
      events.push({
        id: eventId(getTxHash(log), getLogIndex(log), "transfer"),
        type: "transfer",
        tokenId,
        from: normalizeAddress(from),
        to: normalizeAddress(to),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    for (const log of listedLogs) {
      const args = getArgs(log);
      events.push({
        id: eventId(getTxHash(log), getLogIndex(log), "listed"),
        type: "listed",
        tokenId: toBigInt(args?.[0] ?? 0n),
        seller: normalizeAddress(String(args?.[1] ?? ZERO_ADDRESS)),
        price: toBigInt(args?.[2] ?? 0n),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    for (const log of cancelledLogs) {
      const args = getArgs(log);
      events.push({
        id: eventId(getTxHash(log), getLogIndex(log), "cancelled"),
        type: "cancelled",
        tokenId: toBigInt(args?.[0] ?? 0n),
        actor: normalizeAddress(String(args?.[1] ?? ZERO_ADDRESS)),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    for (const log of soldLogs) {
      const args = getArgs(log);
      events.push({
        id: eventId(getTxHash(log), getLogIndex(log), "sold"),
        type: "sold",
        tokenId: toBigInt(args?.[0] ?? 0n),
        seller: normalizeAddress(String(args?.[1] ?? ZERO_ADDRESS)),
        buyer: normalizeAddress(String(args?.[2] ?? ZERO_ADDRESS)),
        price: toBigInt(args?.[3] ?? 0n),
        feeAmount: toBigInt(args?.[4] ?? 0n),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    for (const log of usedLogs) {
      const args = getArgs(log);
      events.push({
        id: eventId(getTxHash(log), getLogIndex(log), "used"),
        type: "used",
        tokenId: toBigInt(args?.[0] ?? 0n),
        scanner: normalizeAddress(String(args?.[1] ?? ZERO_ADDRESS)),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    for (const log of collectibleLogs) {
      const args = getArgs(log);
      events.push({
        id: eventId(getTxHash(log), getLogIndex(log), "collectible_mode"),
        type: "collectible_mode",
        enabled: Boolean(args?.[0]),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    const sorted = events.sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber - right.blockNumber;
      }
      return left.logIndex - right.logIndex;
    });

    const timestampByBlock = new Map<number, number | null>();
    await Promise.all(
      Array.from(new Set(sorted.map((event) => event.blockNumber))).map(async (blockNumber) => {
        const block = await this.provider.getBlock(blockNumber);
        timestampByBlock.set(blockNumber, block ? block.timestamp : null);
      }),
    );

    for (const event of sorted) {
      event.timestamp = timestampByBlock.get(event.blockNumber) ?? null;
    }

    return sorted;
  }

  private async collectMetadataRefreshes(
    fromBlock: number,
    toBlock: number,
  ): Promise<MetadataRefreshTrigger[]> {
    const [collectibleLogs, baseUriLogs] = await Promise.all([
      this.ticketContract.queryFilter(
        this.ticketContract.filters.CollectibleModeUpdated(),
        fromBlock,
        toBlock,
      ),
      this.ticketContract.queryFilter(
        this.ticketContract.filters.BaseUrisUpdated(),
        fromBlock,
        toBlock,
      ),
    ]);

    const refreshes: MetadataRefreshTrigger[] = [];

    for (const log of collectibleLogs) {
      refreshes.push({
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        reason: "collectible_mode",
      });
    }

    for (const log of baseUriLogs) {
      refreshes.push({
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        reason: "base_uris",
      });
    }

    return refreshes.sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber - right.blockNumber;
      }
      return left.logIndex - right.logIndex;
    });
  }

  private async loadTokenUris(events: IndexedEvent[]): Promise<Map<string, string>> {
    const tokenIds = Array.from(
      new Set(
        events
          .filter((event) => event.type === "transfer")
          .map((event) => event.tokenId.toString()),
      ),
    );
    return this.loadTokenUrisForIds(tokenIds);
  }

  private async loadStoredTokenUris(): Promise<Map<string, string>> {
    const result = await pool.query<{ token_id: string }>(
      "SELECT token_id FROM ticket_state ORDER BY token_id::numeric ASC",
    );
    const tokenIds = result.rows.map((row) => row.token_id);

    return this.loadTokenUrisForIds(tokenIds);
  }

  private async loadTokenUrisForIds(tokenIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    await Promise.all(
      tokenIds.map(async (tokenId) => {
        try {
          const uri = await this.ticketContract.tokenURI(BigInt(tokenId));
          map.set(tokenId, String(uri));
        } catch {
          map.set(tokenId, "");
        }
      }),
    );
    return map;
  }

  private async applyTokenUriRefreshes(
    client: PoolClient,
    tokenUriMap: Map<string, string>,
  ): Promise<void> {
    if (tokenUriMap.size === 0) {
      return;
    }

    for (const [tokenId, tokenUri] of tokenUriMap.entries()) {
      if (!tokenUri) {
        continue;
      }

      await client.query(
        `
          UPDATE ticket_state
          SET token_uri = $2
          WHERE token_id = $1
        `,
        [tokenId, tokenUri],
      );
    }
  }

  private async insertEvent(client: PoolClient, event: IndexedEvent): Promise<void> {
    await client.query(
      `
        INSERT INTO indexed_events (
          event_id,
          event_type,
          token_id,
          block_number,
          log_index,
          tx_hash,
          actor_from,
          actor_to,
          seller,
          buyer,
          scanner,
          price_wei,
          fee_amount_wei,
          collectible_enabled,
          block_timestamp,
          payload
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb
        )
        ON CONFLICT (event_id) DO NOTHING
      `,
      [
        event.id,
        event.type,
        event.tokenId?.toString() ?? null,
        event.blockNumber,
        event.logIndex,
        event.txHash,
        event.type === "transfer" ? event.from : null,
        event.type === "transfer" ? event.to : null,
        event.type === "listed" || event.type === "sold" ? event.seller : null,
        event.type === "sold" ? event.buyer : null,
        event.type === "used" ? event.scanner : null,
        event.type === "listed" || event.type === "sold" ? event.price.toString() : null,
        event.type === "sold" ? event.feeAmount.toString() : null,
        event.type === "collectible_mode" ? event.enabled : null,
        event.timestamp,
        JSON.stringify(event),
      ],
    );
  }

  private async applyEvent(
    client: PoolClient,
    event: IndexedEvent,
    tokenUriMap: Map<string, string>,
  ): Promise<void> {
    if (event.type === "transfer") {
      const tokenId = event.tokenId.toString();
      const tokenUri = tokenUriMap.get(tokenId) ?? "";
      await client.query(
        `
          INSERT INTO ticket_state (
            token_id,
            owner,
            used,
            token_uri,
            listed,
            listing_price_wei,
            updated_block,
            updated_tx_hash
          )
          VALUES ($1, $2, FALSE, $3, FALSE, NULL, $4, $5)
          ON CONFLICT (token_id) DO UPDATE
          SET owner = EXCLUDED.owner,
              used = ticket_state.used,
              token_uri = CASE
                WHEN EXCLUDED.token_uri = '' THEN ticket_state.token_uri
                ELSE EXCLUDED.token_uri
              END,
              listed = FALSE,
              listing_price_wei = NULL,
              updated_block = EXCLUDED.updated_block,
              updated_tx_hash = EXCLUDED.updated_tx_hash
        `,
        [tokenId, event.to, tokenUri, event.blockNumber, event.txHash],
      );
      return;
    }

    if (event.type === "listed") {
      const tokenId = event.tokenId.toString();
      await client.query(
        `
          INSERT INTO listing_state (token_id, seller, price_wei, is_active, updated_block, updated_tx_hash)
          VALUES ($1, $2, $3, TRUE, $4, $5)
          ON CONFLICT (token_id) DO UPDATE
          SET seller = EXCLUDED.seller,
              price_wei = EXCLUDED.price_wei,
              is_active = TRUE,
              updated_block = EXCLUDED.updated_block,
              updated_tx_hash = EXCLUDED.updated_tx_hash
        `,
        [tokenId, event.seller, event.price.toString(), event.blockNumber, event.txHash],
      );
      await client.query(
        `
          INSERT INTO ticket_state (
            token_id,
            owner,
            used,
            token_uri,
            listed,
            listing_price_wei,
            updated_block,
            updated_tx_hash
          )
          VALUES ($1, $2, FALSE, '', TRUE, $3, $4, $5)
          ON CONFLICT (token_id) DO UPDATE
          SET listed = TRUE,
              listing_price_wei = EXCLUDED.listing_price_wei,
              updated_block = EXCLUDED.updated_block,
              updated_tx_hash = EXCLUDED.updated_tx_hash
        `,
        [tokenId, event.seller, event.price.toString(), event.blockNumber, event.txHash],
      );
      return;
    }

    if (event.type === "cancelled") {
      const tokenId = event.tokenId.toString();
      await client.query(
        `
          UPDATE listing_state
          SET is_active = FALSE, updated_block = $2, updated_tx_hash = $3
          WHERE token_id = $1
        `,
        [tokenId, event.blockNumber, event.txHash],
      );
      await client.query(
        `
          UPDATE ticket_state
          SET listed = FALSE, listing_price_wei = NULL, updated_block = $2, updated_tx_hash = $3
          WHERE token_id = $1
        `,
        [tokenId, event.blockNumber, event.txHash],
      );
      return;
    }

    if (event.type === "sold") {
      const tokenId = event.tokenId.toString();
      await client.query(
        `
          UPDATE listing_state
          SET is_active = FALSE, updated_block = $2, updated_tx_hash = $3
          WHERE token_id = $1
        `,
        [tokenId, event.blockNumber, event.txHash],
      );
      await client.query(
        `
          INSERT INTO ticket_state (
            token_id,
            owner,
            used,
            token_uri,
            listed,
            listing_price_wei,
            updated_block,
            updated_tx_hash
          )
          VALUES ($1, $2, FALSE, '', FALSE, NULL, $3, $4)
          ON CONFLICT (token_id) DO UPDATE
          SET owner = EXCLUDED.owner,
              listed = FALSE,
              listing_price_wei = NULL,
              updated_block = EXCLUDED.updated_block,
              updated_tx_hash = EXCLUDED.updated_tx_hash
        `,
        [tokenId, event.buyer, event.blockNumber, event.txHash],
      );
      return;
    }

    if (event.type === "used") {
      const tokenId = event.tokenId.toString();
      const updated = await client.query(
        `
          UPDATE ticket_state
          SET used = TRUE,
              listed = FALSE,
              listing_price_wei = NULL,
              updated_block = $2,
              updated_tx_hash = $3
          WHERE token_id = $1
        `,
        [tokenId, event.blockNumber, event.txHash],
      );

      if (updated.rowCount === 0) {
        const [owner, tokenUri] = await Promise.all([
          this.ticketContract.ownerOf(event.tokenId),
          this.ticketContract.tokenURI(event.tokenId).catch(() => ""),
        ]);

        await client.query(
          `
            INSERT INTO ticket_state (
              token_id,
              owner,
              used,
              token_uri,
              listed,
              listing_price_wei,
              updated_block,
              updated_tx_hash
            )
            VALUES ($1, $2, TRUE, $3, FALSE, NULL, $4, $5)
            ON CONFLICT (token_id) DO UPDATE
            SET owner = COALESCE(NULLIF(ticket_state.owner, ''), EXCLUDED.owner),
                used = TRUE,
                listed = FALSE,
                listing_price_wei = NULL,
                token_uri = CASE
                  WHEN EXCLUDED.token_uri = '' THEN ticket_state.token_uri
                  ELSE EXCLUDED.token_uri
                END,
                updated_block = EXCLUDED.updated_block,
                updated_tx_hash = EXCLUDED.updated_tx_hash
          `,
          [tokenId, normalizeAddress(String(owner)), String(tokenUri), event.blockNumber, event.txHash],
        );
      }
      return;
    }
  }
}
