import { EventEmitter } from "node:events";

import { Contract, JsonRpcProvider } from "ethers";
import type { PoolClient } from "pg";

import { CHECKIN_ABI, FACTORY_ABI, MARKETPLACE_ABI, TICKET_NFT_ABI } from "./abi.js";
import { config } from "./config.js";
import {
  getChainStateNumber,
  getChainStateString,
  getEventDeployments,
  pool,
  resetIndexedState,
  setChainStateNumber,
  setChainStateString,
  upsertEventDeployment,
  withTransaction,
} from "./db.js";
import { logger } from "./logger.js";
import type {
  ChainEventPayload,
  ContractScope,
  IndexedEvent,
  OperationalActivity,
  TicketEventDeployment,
} from "./types.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEPLOYMENT_SYNC_TTL_MS = 30_000;
const SYSTEM_STATE_CACHE_TTL_MS = 20_000;

interface MetadataRefreshTrigger {
  ticketEventId: string;
  blockNumber: number;
  logIndex: number;
  txHash: string;
  reason: "collectible_mode" | "base_uris";
}

interface ContractSet {
  deployment: TicketEventDeployment;
  ticketContract: Contract;
  marketplaceContract: Contract;
  checkInContract: Contract;
}

interface IndexedOperationalActivity extends OperationalActivity {
  contractScope: ContractScope;
}

export interface IndexerStatus {
  running: boolean;
  haltedByRateLimit: boolean;
  haltedReason: string | null;
  currentBatchSize: number;
  currentBackoffMs: number;
  consecutiveRateLimitErrors: number;
  totalRateLimitErrors: number;
  totalEventsProcessed: number;
  totalMetadataRefreshes: number;
  totalRangesProcessed: number;
  totalReorgResets: number;
  lastRateLimitAt: number | null;
  lastProcessedAt: number | null;
  lastProcessedRangeFrom: number | null;
  lastProcessedRangeTo: number | null;
  lastProcessedDurationMs: number | null;
}

interface CachedSystemState {
  primaryPriceWei: string;
  maxSupply: string;
  totalMinted: string;
  maxPerWallet: string;
  paused: boolean;
  collectibleMode: boolean;
  baseTokenURI: string;
  collectibleBaseURI: string;
}

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

function eventId(ticketEventId: string, txHash: string, logIndex: number, type: string): string {
  return `${ticketEventId}:${txHash}:${logIndex}:${type}`;
}

function tokenStateKey(ticketEventId: string, tokenId: string): string {
  return `${ticketEventId}::${tokenId}`;
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

function serializePayload(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    typeof entry === "bigint" ? entry.toString() : entry,
  );
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

export class ChainIndexer extends EventEmitter {
  private readonly provider: JsonRpcProvider;
  private readonly factoryContract: Contract | null;

  private contractSets = new Map<string, ContractSet>();
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private currentBatchSize = config.indexerBatchSize;
  private consecutiveRateLimitErrors = 0;
  private haltedByRateLimit = false;
  private haltedReason: string | null = null;
  private currentBackoffMs = 0;
  private totalRateLimitErrors = 0;
  private totalEventsProcessed = 0;
  private totalMetadataRefreshes = 0;
  private totalRangesProcessed = 0;
  private totalReorgResets = 0;
  private lastRateLimitAt: number | null = null;
  private lastProcessedAt: number | null = null;
  private lastProcessedRangeFrom: number | null = null;
  private lastProcessedRangeTo: number | null = null;
  private lastProcessedDurationMs: number | null = null;
  private cachedSystemStates = new Map<
    string,
    { state: CachedSystemState; cachedAt: number }
  >();
  private lastDeploymentSyncAt = 0;
  private emptyRangesSinceLastInfo = 0;

  constructor() {
    super();
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
    this.factoryContract = config.factoryAddress
      ? new Contract(config.factoryAddress, FACTORY_ABI, this.provider)
      : null;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    await this.syncEventDeployments(true);
    await this.reconcileIndexedCursor(this.getDeploymentFloor());

    this.currentBatchSize = Math.max(
      config.indexerMinBatchSize,
      Math.min(config.indexerBatchSize, this.currentBatchSize),
    );
    this.consecutiveRateLimitErrors = 0;
    this.haltedByRateLimit = false;
    this.haltedReason = null;
    this.currentBackoffMs = 0;
    this.running = true;
    logger.info(
      {
        ticketEventIds: [...this.contractSets.keys()],
      },
      "Starting block indexer...",
    );
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
      currentBackoffMs: this.currentBackoffMs,
      consecutiveRateLimitErrors: this.consecutiveRateLimitErrors,
      totalRateLimitErrors: this.totalRateLimitErrors,
      totalEventsProcessed: this.totalEventsProcessed,
      totalMetadataRefreshes: this.totalMetadataRefreshes,
      totalRangesProcessed: this.totalRangesProcessed,
      totalReorgResets: this.totalReorgResets,
      lastRateLimitAt: this.lastRateLimitAt,
      lastProcessedAt: this.lastProcessedAt,
      lastProcessedRangeFrom: this.lastProcessedRangeFrom,
      lastProcessedRangeTo: this.lastProcessedRangeTo,
      lastProcessedDurationMs: this.lastProcessedDurationMs,
    };
  }

  async getCurrentSystemState(ticketEventId = config.defaultEventId): Promise<CachedSystemState> {
    const now = Date.now();
    const cached = this.cachedSystemStates.get(ticketEventId);
    if (cached && now - cached.cachedAt < SYSTEM_STATE_CACHE_TTL_MS) {
      return cached.state;
    }

    const contractSet = await this.getContractSet(ticketEventId);

    try {
      const [
        primaryPrice,
        maxSupply,
        totalMinted,
        maxPerWallet,
        paused,
        collectibleMode,
        baseUris,
      ] =
        await Promise.all([
          contractSet.ticketContract.primaryPrice(),
          contractSet.ticketContract.maxSupply(),
          contractSet.ticketContract.totalMinted(),
          contractSet.ticketContract.maxPerWallet(),
          contractSet.ticketContract.paused(),
          contractSet.ticketContract.collectibleMode(),
          contractSet.ticketContract.baseUris().catch(() => ["", ""]),
        ]);

      const fresh: CachedSystemState = {
        primaryPriceWei: String(primaryPrice),
        maxSupply: String(maxSupply),
        totalMinted: String(totalMinted),
        maxPerWallet: String(maxPerWallet),
        paused: Boolean(paused),
        collectibleMode: Boolean(collectibleMode),
        baseTokenURI: String(baseUris[0] ?? ""),
        collectibleBaseURI: String(baseUris[1] ?? ""),
      };

      this.cachedSystemStates.set(ticketEventId, {
        state: fresh,
        cachedAt: now,
      });
      return fresh;
    } catch (error) {
      if (cached) {
        logger.warn(
          {
            error: normalizeErrorMessage(error),
            staleAgeMs: now - cached.cachedAt,
            ticketEventId,
          },
          "Serving stale cached system state due to RPC error.",
        );
        return cached.state;
      }
      throw error;
    }
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.syncEventDeployments();
        const deploymentFloor = this.getDeploymentFloor();
        const indexedBlock = await this.reconcileIndexedCursor(deploymentFloor);
        const latestBlock = await this.provider.getBlockNumber();
        const targetBlock = Math.max(
          deploymentFloor - 1,
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
        this.currentBackoffMs = 0;
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
          this.currentBackoffMs = delayWithJitter;
          this.lastRateLimitAt = Date.now();

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
        this.currentBackoffMs = 0;
        await sleep(config.indexerPollIntervalMs);
      }
    }
  }

  private createLegacyDeployment(): TicketEventDeployment {
    return {
      ticketEventId: config.defaultEventId,
      name: config.defaultEventId,
      symbol: "CTK",
      primaryPriceWei: "0",
      maxSupply: "0",
      treasury: "",
      admin: "",
      ticketNftAddress: config.ticketNftAddress ?? ZERO_ADDRESS,
      marketplaceAddress: config.marketplaceAddress ?? ZERO_ADDRESS,
      checkInRegistryAddress: config.checkInRegistryAddress ?? ZERO_ADDRESS,
      deploymentBlock: config.deploymentBlock,
      registeredAt: 0,
    };
  }

  private createContractSet(deployment: TicketEventDeployment): ContractSet {
    return {
      deployment,
      ticketContract: new Contract(
        deployment.ticketNftAddress,
        TICKET_NFT_ABI,
        this.provider,
      ),
      marketplaceContract: new Contract(
        deployment.marketplaceAddress,
        MARKETPLACE_ABI,
        this.provider,
      ),
      checkInContract: new Contract(
        deployment.checkInRegistryAddress,
        CHECKIN_ABI,
        this.provider,
      ),
    };
  }

  private isSameDeployment(
    left: TicketEventDeployment,
    right: TicketEventDeployment,
  ): boolean {
    return (
      left.ticketEventId === right.ticketEventId &&
      left.ticketNftAddress.toLowerCase() === right.ticketNftAddress.toLowerCase() &&
      left.marketplaceAddress.toLowerCase() === right.marketplaceAddress.toLowerCase() &&
      left.checkInRegistryAddress.toLowerCase() ===
        right.checkInRegistryAddress.toLowerCase() &&
      left.deploymentBlock === right.deploymentBlock &&
      left.primaryPriceWei === right.primaryPriceWei &&
      left.maxSupply === right.maxSupply &&
      left.name === right.name &&
      left.symbol === right.symbol &&
      left.treasury.toLowerCase() === right.treasury.toLowerCase() &&
      left.admin.toLowerCase() === right.admin.toLowerCase() &&
      left.registeredAt === right.registeredAt
    );
  }

  getDeploymentFloor(): number {
    const blocks = [...this.contractSets.values()].map(
      (contractSet) => contractSet.deployment.deploymentBlock,
    );
    return blocks.length > 0 ? Math.min(...blocks) : config.deploymentBlock;
  }

  private async reconcileIndexedCursor(deploymentFloor: number): Promise<number> {
    const minimumIndexedBlock = deploymentFloor - 1;
    const indexedBlock = await getChainStateNumber(
      "last_indexed_block",
      minimumIndexedBlock,
    );

    if (indexedBlock >= minimumIndexedBlock) {
      return indexedBlock;
    }

    logger.warn(
      {
        indexedBlock,
        deploymentFloor,
        resetToBlock: minimumIndexedBlock,
      },
      "Stored indexer cursor predates deployment floor, resetting indexed state.",
    );
    await this.resetToBlock(minimumIndexedBlock);
    return minimumIndexedBlock;
  }

  private async fetchDeployments(): Promise<TicketEventDeployment[]> {
    if (!this.factoryContract) {
      return [this.createLegacyDeployment()];
    }

    const totalEvents = Number(await this.factoryContract.totalEvents());
    if (totalEvents === 0) {
      return [];
    }

    const rawDeployments = await Promise.all(
      Array.from({ length: totalEvents }, async (_value, index) =>
        this.factoryContract?.getEventAt(index),
      ),
    );

    return rawDeployments
      .filter((deployment): deployment is NonNullable<typeof deployment> => Boolean(deployment))
      .map((deployment) => parseFactoryDeployment(deployment))
      .sort((left, right) => {
        if (left.deploymentBlock !== right.deploymentBlock) {
          return left.deploymentBlock - right.deploymentBlock;
        }
        return left.ticketEventId.localeCompare(right.ticketEventId);
      });
  }

  private async syncEventDeployments(force = false): Promise<void> {
    const now = Date.now();
    if (
      !force &&
      now - this.lastDeploymentSyncAt < DEPLOYMENT_SYNC_TTL_MS &&
      this.contractSets.size > 0
    ) {
      return;
    }

    const deployments = await this.fetchDeployments();
    if (deployments.length === 0) {
      this.contractSets.clear();
      this.cachedSystemStates.clear();
      this.lastDeploymentSyncAt = now;
      return;
    }

    const persistedDeployments = await getEventDeployments();
    const persistedById = new Map(
      persistedDeployments.map((deployment) => [deployment.ticket_event_id, deployment]),
    );
    const deploymentFloor = Math.min(
      ...deployments.map((deployment) => deployment.deploymentBlock),
    );
    const lastIndexed = await getChainStateNumber("last_indexed_block", deploymentFloor - 1);

    let rewindFromBlock: number | null = null;
    for (const deployment of deployments) {
      const persisted = persistedById.get(deployment.ticketEventId);
      if (!persisted) {
        if (lastIndexed >= deployment.deploymentBlock) {
          rewindFromBlock =
            rewindFromBlock === null
              ? deployment.deploymentBlock
              : Math.min(rewindFromBlock, deployment.deploymentBlock);
        }
        continue;
      }

      const persistedDeployment: TicketEventDeployment = {
        ticketEventId: persisted.ticket_event_id,
        name: persisted.name,
        symbol: persisted.symbol,
        primaryPriceWei: persisted.primary_price_wei,
        maxSupply: persisted.max_supply,
        treasury: persisted.treasury,
        admin: persisted.admin,
        ticketNftAddress: persisted.ticket_nft_address,
        marketplaceAddress: persisted.marketplace_address,
        checkInRegistryAddress: persisted.checkin_registry_address,
        deploymentBlock: Number(persisted.deployment_block),
        registeredAt: Number(persisted.registered_at),
      };

      if (
        !this.isSameDeployment(deployment, persistedDeployment) &&
        lastIndexed >= Math.min(deployment.deploymentBlock, persistedDeployment.deploymentBlock)
      ) {
        const candidate = Math.min(
          deployment.deploymentBlock,
          persistedDeployment.deploymentBlock,
        );
        rewindFromBlock =
          rewindFromBlock === null ? candidate : Math.min(rewindFromBlock, candidate);
      }
    }

    await withTransaction(async (client) => {
      for (const deployment of deployments) {
        await upsertEventDeployment(client, {
          ticket_event_id: deployment.ticketEventId,
          name: deployment.name,
          symbol: deployment.symbol,
          primary_price_wei: deployment.primaryPriceWei,
          max_supply: deployment.maxSupply,
          treasury: deployment.treasury,
          admin: deployment.admin,
          ticket_nft_address: deployment.ticketNftAddress,
          marketplace_address: deployment.marketplaceAddress,
          checkin_registry_address: deployment.checkInRegistryAddress,
          deployment_block: String(deployment.deploymentBlock),
          registered_at: String(deployment.registeredAt),
        });
      }
    });

    const nextContractSets = new Map<string, ContractSet>();
    for (const deployment of deployments) {
      const existing = this.contractSets.get(deployment.ticketEventId);
      if (existing && this.isSameDeployment(existing.deployment, deployment)) {
        nextContractSets.set(deployment.ticketEventId, {
          ...existing,
          deployment,
        });
        continue;
      }

      nextContractSets.set(deployment.ticketEventId, this.createContractSet(deployment));
    }

    const removedIds = [...this.contractSets.keys()].filter(
      (ticketEventId) => !nextContractSets.has(ticketEventId),
    );
    for (const ticketEventId of removedIds) {
      this.cachedSystemStates.delete(ticketEventId);
    }

    this.contractSets = nextContractSets;
    this.lastDeploymentSyncAt = now;

    if (rewindFromBlock !== null) {
      logger.warn(
        {
          rewindFromBlock,
          ticketEventIds: deployments.map((deployment) => deployment.ticketEventId),
        },
        "Deployment catalog changed behind the current cursor, resetting indexed state.",
      );
      await this.resetToBlock(rewindFromBlock - 1);
    }
  }

  private async getContractSet(ticketEventId: string): Promise<ContractSet> {
    const existing = this.contractSets.get(ticketEventId);
    if (existing) {
      return existing;
    }

    await this.syncEventDeployments(true);
    const refreshed = this.contractSets.get(ticketEventId);
    if (!refreshed) {
      throw new Error(`Unknown ticket event id: ${ticketEventId}`);
    }
    return refreshed;
  }

  private async resetToBlock(lastIndexedBlock: number): Promise<void> {
    await withTransaction(async (client) => {
      await resetIndexedState(client);
      await setChainStateNumber(client, "last_indexed_block", lastIndexedBlock);
      await setChainStateString(client, "last_indexed_hash", ZERO_ADDRESS);
    });

    this.totalReorgResets += 1;
    this.lastProcessedAt = null;
    this.lastProcessedRangeFrom = null;
    this.lastProcessedRangeTo = null;
    this.lastProcessedDurationMs = null;
    this.cachedSystemStates.clear();
  }

  private async ensureNoReorg(lastIndexed: number, nextFrom: number): Promise<void> {
    const deploymentFloor = this.getDeploymentFloor();
    if (lastIndexed < deploymentFloor || nextFrom <= deploymentFloor) {
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

    await this.resetToBlock(deploymentFloor - 1);
  }

  private async processRange(fromBlock: number, toBlock: number): Promise<void> {
    const startedAt = Date.now();
    const events = await this.collectEvents(fromBlock, toBlock);
    const operationalActivities = await this.collectOperationalActivities(fromBlock, toBlock);
    const tokenUriMap = await this.loadTokenUris(events);
    const metadataRefreshes = await this.collectMetadataRefreshes(fromBlock, toBlock);
    const metadataTokenUriMap =
      metadataRefreshes.length > 0
        ? await this.loadStoredTokenUris(
            Array.from(new Set(metadataRefreshes.map((refresh) => refresh.ticketEventId))),
          )
        : new Map<string, string>();
    const endBlock = await this.provider.getBlock(toBlock);

    await withTransaction(async (client) => {
      for (const event of events) {
        await this.insertEvent(client, event);
        await this.applyEvent(client, event, tokenUriMap);
      }
      for (const activity of operationalActivities) {
        await this.insertOperationalActivity(client, activity);
        await this.applyOperationalActivity(client, activity);
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

    this.totalEventsProcessed += events.length + operationalActivities.length;
    this.totalMetadataRefreshes += metadataRefreshes.length;
    this.totalRangesProcessed += 1;
    this.lastProcessedAt = Date.now();
    this.lastProcessedRangeFrom = fromBlock;
    this.lastProcessedRangeTo = toBlock;
    this.lastProcessedDurationMs = this.lastProcessedAt - startedAt;

    for (const ticketEventId of new Set([
      ...events.map((event) => event.ticketEventId),
      ...operationalActivities.map((activity) => activity.ticketEventId),
    ])) {
      this.cachedSystemStates.delete(ticketEventId);
    }

    for (const event of events) {
      const payload: ChainEventPayload = {
        ticketEventId: event.ticketEventId,
        type: event.type,
        tokenId: event.tokenId ? event.tokenId.toString() : undefined,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
      };
      this.emit("event", payload);
    }

    this.logProcessedRangeSummary({
      fromBlock,
      toBlock,
      eventCount: events.length,
      operationalActivityCount: operationalActivities.length,
      metadataRefreshCount: metadataRefreshes.length,
      ticketEventIds: [...new Set(events.map((event) => event.ticketEventId))],
    });
  }

  private logProcessedRangeSummary(input: {
    fromBlock: number;
    toBlock: number;
    eventCount: number;
    operationalActivityCount: number;
    metadataRefreshCount: number;
    ticketEventIds: string[];
  }): void {
    const payload = {
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
      eventCount: input.eventCount,
      operationalActivityCount: input.operationalActivityCount,
      metadataRefreshCount: input.metadataRefreshCount,
      ticketEventIds: input.ticketEventIds,
    };
    const hasVisibleActivity =
      input.eventCount > 0 ||
      input.operationalActivityCount > 0 ||
      input.metadataRefreshCount > 0;

    if (hasVisibleActivity) {
      this.emptyRangesSinceLastInfo = 0;
      logger.info(payload, "Indexer processed block range.");
      return;
    }

    this.emptyRangesSinceLastInfo += 1;
    if (this.emptyRangesSinceLastInfo % 25 === 0) {
      logger.info(
        {
          ...payload,
          emptyRangesSinceLastInfo: this.emptyRangesSinceLastInfo,
        },
        "Indexer processed empty block ranges.",
      );
      return;
    }

    logger.debug(payload, "Indexer processed empty block range.");
  }

  private async collectEvents(fromBlock: number, toBlock: number): Promise<IndexedEvent[]> {
    const resultSets = await Promise.all(
      [...this.contractSets.values()].map((contractSet) =>
        this.collectEventsForContractSet(contractSet, fromBlock, toBlock),
      ),
    );

    const sorted = resultSets.flat().sort((left, right) => {
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

  private async collectEventsForContractSet(
    contractSet: ContractSet,
    fromBlock: number,
    toBlock: number,
  ): Promise<IndexedEvent[]> {
    const from = Math.max(fromBlock, contractSet.deployment.deploymentBlock);
    if (from > toBlock) {
      return [];
    }

    const [transferLogs, listedLogs, cancelledLogs, soldLogs, usedLogs, collectibleLogs] =
      await Promise.all([
        contractSet.ticketContract.queryFilter(
          contractSet.ticketContract.filters.Transfer(),
          from,
          toBlock,
        ),
        contractSet.marketplaceContract.queryFilter(
          contractSet.marketplaceContract.filters.Listed(),
          from,
          toBlock,
        ),
        contractSet.marketplaceContract.queryFilter(
          contractSet.marketplaceContract.filters.Cancelled(),
          from,
          toBlock,
        ),
        contractSet.marketplaceContract.queryFilter(
          contractSet.marketplaceContract.filters.Sold(),
          from,
          toBlock,
        ),
        contractSet.checkInContract.queryFilter(
          contractSet.checkInContract.filters.TicketMarkedUsed(),
          from,
          toBlock,
        ),
        contractSet.ticketContract.queryFilter(
          contractSet.ticketContract.filters.CollectibleModeUpdated(),
          from,
          toBlock,
        ),
      ]);

    const events: IndexedEvent[] = [];

    for (const log of transferLogs) {
      const args = getArgs(log);
      const fromAddress = String(args?.[0] ?? ZERO_ADDRESS);
      const toAddress = String(args?.[1] ?? ZERO_ADDRESS);
      const tokenId = toBigInt(args?.[2] ?? 0n);
      events.push({
        id: eventId(
          contractSet.deployment.ticketEventId,
          getTxHash(log),
          getLogIndex(log),
          "transfer",
        ),
        ticketEventId: contractSet.deployment.ticketEventId,
        type: "transfer",
        tokenId,
        from: normalizeAddress(fromAddress),
        to: normalizeAddress(toAddress),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    for (const log of listedLogs) {
      const args = getArgs(log);
      events.push({
        id: eventId(
          contractSet.deployment.ticketEventId,
          getTxHash(log),
          getLogIndex(log),
          "listed",
        ),
        ticketEventId: contractSet.deployment.ticketEventId,
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
        id: eventId(
          contractSet.deployment.ticketEventId,
          getTxHash(log),
          getLogIndex(log),
          "cancelled",
        ),
        ticketEventId: contractSet.deployment.ticketEventId,
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
        id: eventId(
          contractSet.deployment.ticketEventId,
          getTxHash(log),
          getLogIndex(log),
          "sold",
        ),
        ticketEventId: contractSet.deployment.ticketEventId,
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
        id: eventId(
          contractSet.deployment.ticketEventId,
          getTxHash(log),
          getLogIndex(log),
          "used",
        ),
        ticketEventId: contractSet.deployment.ticketEventId,
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
        id: eventId(
          contractSet.deployment.ticketEventId,
          getTxHash(log),
          getLogIndex(log),
          "collectible_mode",
        ),
        ticketEventId: contractSet.deployment.ticketEventId,
        type: "collectible_mode",
        enabled: Boolean(args?.[0]),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    return events;
  }

  private async collectOperationalActivities(
    fromBlock: number,
    toBlock: number,
  ): Promise<IndexedOperationalActivity[]> {
    const resultSets = await Promise.all(
      [...this.contractSets.values()].map((contractSet) =>
        this.collectOperationalActivitiesForContractSet(contractSet, fromBlock, toBlock),
      ),
    );

    const sorted = resultSets.flat().sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber - right.blockNumber;
      }
      return left.logIndex - right.logIndex;
    });

    const timestampByBlock = new Map<number, number | null>();
    await Promise.all(
      Array.from(new Set(sorted.map((activity) => activity.blockNumber))).map(async (blockNumber) => {
        const block = await this.provider.getBlock(blockNumber);
        timestampByBlock.set(blockNumber, block ? block.timestamp : null);
      }),
    );

    for (const activity of sorted) {
      activity.timestamp = timestampByBlock.get(activity.blockNumber) ?? null;
    }

    return sorted;
  }

  private async collectOperationalActivitiesForContractSet(
    contractSet: ContractSet,
    fromBlock: number,
    toBlock: number,
  ): Promise<IndexedOperationalActivity[]> {
    const from = Math.max(fromBlock, contractSet.deployment.deploymentBlock);
    if (from > toBlock) {
      return [];
    }

    const [pausedLogs, unpausedLogs, ticketRoleGrantedLogs, ticketRoleRevokedLogs, checkInRoleGrantedLogs, checkInRoleRevokedLogs] =
      await Promise.all([
        contractSet.ticketContract.queryFilter(
          contractSet.ticketContract.filters.Paused(),
          from,
          toBlock,
        ),
        contractSet.ticketContract.queryFilter(
          contractSet.ticketContract.filters.Unpaused(),
          from,
          toBlock,
        ),
        contractSet.ticketContract.queryFilter(
          contractSet.ticketContract.filters.RoleGranted(),
          from,
          toBlock,
        ),
        contractSet.ticketContract.queryFilter(
          contractSet.ticketContract.filters.RoleRevoked(),
          from,
          toBlock,
        ),
        contractSet.checkInContract.queryFilter(
          contractSet.checkInContract.filters.RoleGranted(),
          from,
          toBlock,
        ),
        contractSet.checkInContract.queryFilter(
          contractSet.checkInContract.filters.RoleRevoked(),
          from,
          toBlock,
        ),
      ]);

    const activities: IndexedOperationalActivity[] = [];

    const pushRoleActivities = (
      logs: unknown[],
      contractScope: ContractScope,
      type: "role_granted" | "role_revoked",
    ) => {
      for (const log of logs) {
        const args = getArgs(log);
        activities.push({
          id: eventId(
            contractSet.deployment.ticketEventId,
            getTxHash(log),
            getLogIndex(log),
            `${contractScope}:${type}`,
          ),
          ticketEventId: contractSet.deployment.ticketEventId,
          contractScope,
          type,
          roleId: String(args?.[0] ?? ""),
          account: normalizeAddress(String(args?.[1] ?? ZERO_ADDRESS)),
          actor: normalizeAddress(String(args?.[2] ?? ZERO_ADDRESS)),
          blockNumber: getBlockNumber(log),
          logIndex: getLogIndex(log),
          txHash: getTxHash(log),
          timestamp: null,
        });
      }
    };

    for (const log of pausedLogs) {
      const args = getArgs(log);
      activities.push({
        id: eventId(
          contractSet.deployment.ticketEventId,
          getTxHash(log),
          getLogIndex(log),
          "ticket:paused",
        ),
        ticketEventId: contractSet.deployment.ticketEventId,
        contractScope: "ticket",
        type: "paused",
        actor: normalizeAddress(String(args?.[0] ?? ZERO_ADDRESS)),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    for (const log of unpausedLogs) {
      const args = getArgs(log);
      activities.push({
        id: eventId(
          contractSet.deployment.ticketEventId,
          getTxHash(log),
          getLogIndex(log),
          "ticket:unpaused",
        ),
        ticketEventId: contractSet.deployment.ticketEventId,
        contractScope: "ticket",
        type: "unpaused",
        actor: normalizeAddress(String(args?.[0] ?? ZERO_ADDRESS)),
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        timestamp: null,
      });
    }

    pushRoleActivities(ticketRoleGrantedLogs, "ticket", "role_granted");
    pushRoleActivities(ticketRoleRevokedLogs, "ticket", "role_revoked");
    pushRoleActivities(checkInRoleGrantedLogs, "checkin_registry", "role_granted");
    pushRoleActivities(checkInRoleRevokedLogs, "checkin_registry", "role_revoked");

    return activities;
  }

  private async collectMetadataRefreshes(
    fromBlock: number,
    toBlock: number,
  ): Promise<MetadataRefreshTrigger[]> {
    const refreshSets = await Promise.all(
      [...this.contractSets.values()].map((contractSet) =>
        this.collectMetadataRefreshesForContractSet(contractSet, fromBlock, toBlock),
      ),
    );

    return refreshSets.flat().sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber - right.blockNumber;
      }
      return left.logIndex - right.logIndex;
    });
  }

  private async collectMetadataRefreshesForContractSet(
    contractSet: ContractSet,
    fromBlock: number,
    toBlock: number,
  ): Promise<MetadataRefreshTrigger[]> {
    const from = Math.max(fromBlock, contractSet.deployment.deploymentBlock);
    if (from > toBlock) {
      return [];
    }

    const [collectibleLogs, baseUriLogs] = await Promise.all([
      contractSet.ticketContract.queryFilter(
        contractSet.ticketContract.filters.CollectibleModeUpdated(),
        from,
        toBlock,
      ),
      contractSet.ticketContract.queryFilter(
        contractSet.ticketContract.filters.BaseUrisUpdated(),
        from,
        toBlock,
      ),
    ]);

    const refreshes: MetadataRefreshTrigger[] = [];

    for (const log of collectibleLogs) {
      refreshes.push({
        ticketEventId: contractSet.deployment.ticketEventId,
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        reason: "collectible_mode",
      });
    }

    for (const log of baseUriLogs) {
      refreshes.push({
        ticketEventId: contractSet.deployment.ticketEventId,
        blockNumber: getBlockNumber(log),
        logIndex: getLogIndex(log),
        txHash: getTxHash(log),
        reason: "base_uris",
      });
    }

    return refreshes;
  }

  private async loadTokenUris(events: IndexedEvent[]): Promise<Map<string, string>> {
    const tokenIdsByEventId = new Map<string, Set<string>>();

    for (const event of events) {
      if (event.type !== "transfer") {
        continue;
      }

      const tokenIds = tokenIdsByEventId.get(event.ticketEventId) ?? new Set<string>();
      tokenIds.add(event.tokenId.toString());
      tokenIdsByEventId.set(event.ticketEventId, tokenIds);
    }

    return this.loadTokenUrisForRequests(tokenIdsByEventId);
  }

  private async loadStoredTokenUris(ticketEventIds: string[]): Promise<Map<string, string>> {
    if (ticketEventIds.length === 0) {
      return new Map();
    }

    const result = await pool.query<{ ticket_event_id: string; token_id: string }>(
      `
        SELECT ticket_event_id, token_id
        FROM ticket_state_items
        WHERE ticket_event_id = ANY($1::text[])
        ORDER BY ticket_event_id ASC, token_id::numeric ASC
      `,
      [ticketEventIds],
    );

    const tokenIdsByEventId = new Map<string, Set<string>>();
    for (const row of result.rows) {
      const tokenIds = tokenIdsByEventId.get(row.ticket_event_id) ?? new Set<string>();
      tokenIds.add(row.token_id);
      tokenIdsByEventId.set(row.ticket_event_id, tokenIds);
    }

    return this.loadTokenUrisForRequests(tokenIdsByEventId);
  }

  private async loadTokenUrisForRequests(
    tokenIdsByEventId: Map<string, Set<string>>,
  ): Promise<Map<string, string>> {
    const tokenUriMap = new Map<string, string>();

    await Promise.all(
      [...tokenIdsByEventId.entries()].map(async ([ticketEventId, tokenIds]) => {
        const contractSet = await this.getContractSet(ticketEventId);
        await Promise.all(
          [...tokenIds].map(async (tokenId) => {
            try {
              const uri = await contractSet.ticketContract.tokenURI(BigInt(tokenId));
              tokenUriMap.set(tokenStateKey(ticketEventId, tokenId), String(uri));
            } catch {
              tokenUriMap.set(tokenStateKey(ticketEventId, tokenId), "");
            }
          }),
        );
      }),
    );

    return tokenUriMap;
  }

  private async applyTokenUriRefreshes(
    client: PoolClient,
    tokenUriMap: Map<string, string>,
  ): Promise<void> {
    if (tokenUriMap.size === 0) {
      return;
    }

    for (const [key, tokenUri] of tokenUriMap.entries()) {
      if (!tokenUri) {
        continue;
      }

      const separatorIndex = key.indexOf("::");
      const ticketEventId = key.slice(0, separatorIndex);
      const tokenId = key.slice(separatorIndex + 2);

      await client.query(
        `
          UPDATE ticket_state_items
          SET token_uri = $3
          WHERE ticket_event_id = $1 AND token_id = $2
        `,
        [ticketEventId, tokenId, tokenUri],
      );
    }
  }

  private async insertEvent(client: PoolClient, event: IndexedEvent): Promise<void> {
    await client.query(
      `
        INSERT INTO indexed_event_log (
          chain_event_id,
          ticket_event_id,
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
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb
        )
        ON CONFLICT (chain_event_id) DO NOTHING
      `,
      [
        event.id,
        event.ticketEventId,
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
        serializePayload(event),
      ],
    );
  }

  private async insertOperationalActivity(
    client: PoolClient,
    activity: IndexedOperationalActivity,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO ops_activity_log (
          activity_id,
          ticket_event_id,
          contract_scope,
          activity_type,
          role_id,
          account,
          actor,
          block_number,
          log_index,
          tx_hash,
          block_timestamp,
          payload
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
        )
        ON CONFLICT (activity_id) DO NOTHING
      `,
      [
        activity.id,
        activity.ticketEventId,
        activity.contractScope,
        activity.type,
        activity.roleId ?? null,
        activity.account ?? null,
        activity.actor ?? null,
        activity.blockNumber,
        activity.logIndex,
        activity.txHash,
        activity.timestamp,
        serializePayload(activity),
      ],
    );
  }

  private async applyOperationalActivity(
    client: PoolClient,
    activity: IndexedOperationalActivity,
  ): Promise<void> {
    if (activity.type !== "role_granted" && activity.type !== "role_revoked") {
      return;
    }

    if (!activity.roleId || !activity.account) {
      return;
    }

    await client.query(
      `
        INSERT INTO role_state_items (
          ticket_event_id,
          contract_scope,
          role_id,
          account,
          granted_by,
          is_active,
          updated_block,
          updated_tx_hash
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (ticket_event_id, contract_scope, role_id, account) DO UPDATE
        SET granted_by = EXCLUDED.granted_by,
            is_active = EXCLUDED.is_active,
            updated_block = EXCLUDED.updated_block,
            updated_tx_hash = EXCLUDED.updated_tx_hash
      `,
      [
        activity.ticketEventId,
        activity.contractScope,
        activity.roleId,
        activity.account,
        activity.actor ?? null,
        activity.type === "role_granted",
        activity.blockNumber,
        activity.txHash,
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
      const tokenUri = tokenUriMap.get(tokenStateKey(event.ticketEventId, tokenId)) ?? "";
      await client.query(
        `
          INSERT INTO ticket_state_items (
            ticket_event_id,
            token_id,
            owner,
            used,
            token_uri,
            listed,
            listing_price_wei,
            updated_block,
            updated_tx_hash
          )
          VALUES ($1, $2, $3, FALSE, $4, FALSE, NULL, $5, $6)
          ON CONFLICT (ticket_event_id, token_id) DO UPDATE
          SET owner = EXCLUDED.owner,
              used = ticket_state_items.used,
              token_uri = CASE
                WHEN EXCLUDED.token_uri = '' THEN ticket_state_items.token_uri
                ELSE EXCLUDED.token_uri
              END,
              listed = FALSE,
              listing_price_wei = NULL,
              updated_block = EXCLUDED.updated_block,
              updated_tx_hash = EXCLUDED.updated_tx_hash
        `,
        [event.ticketEventId, tokenId, event.to, tokenUri, event.blockNumber, event.txHash],
      );
      return;
    }

    if (event.type === "listed") {
      const tokenId = event.tokenId.toString();
      await client.query(
        `
          INSERT INTO listing_state_items (
            ticket_event_id,
            token_id,
            seller,
            price_wei,
            is_active,
            updated_block,
            updated_tx_hash
          )
          VALUES ($1, $2, $3, $4, TRUE, $5, $6)
          ON CONFLICT (ticket_event_id, token_id) DO UPDATE
          SET seller = EXCLUDED.seller,
              price_wei = EXCLUDED.price_wei,
              is_active = TRUE,
              updated_block = EXCLUDED.updated_block,
              updated_tx_hash = EXCLUDED.updated_tx_hash
        `,
        [
          event.ticketEventId,
          tokenId,
          event.seller,
          event.price.toString(),
          event.blockNumber,
          event.txHash,
        ],
      );
      await client.query(
        `
          INSERT INTO ticket_state_items (
            ticket_event_id,
            token_id,
            owner,
            used,
            token_uri,
            listed,
            listing_price_wei,
            updated_block,
            updated_tx_hash
          )
          VALUES ($1, $2, $3, FALSE, '', TRUE, $4, $5, $6)
          ON CONFLICT (ticket_event_id, token_id) DO UPDATE
          SET listed = TRUE,
              listing_price_wei = EXCLUDED.listing_price_wei,
              updated_block = EXCLUDED.updated_block,
              updated_tx_hash = EXCLUDED.updated_tx_hash
        `,
        [
          event.ticketEventId,
          tokenId,
          event.seller,
          event.price.toString(),
          event.blockNumber,
          event.txHash,
        ],
      );
      return;
    }

    if (event.type === "cancelled") {
      const tokenId = event.tokenId.toString();
      await client.query(
        `
          UPDATE listing_state_items
          SET is_active = FALSE, updated_block = $3, updated_tx_hash = $4
          WHERE ticket_event_id = $1 AND token_id = $2
        `,
        [event.ticketEventId, tokenId, event.blockNumber, event.txHash],
      );
      await client.query(
        `
          UPDATE ticket_state_items
          SET listed = FALSE, listing_price_wei = NULL, updated_block = $3, updated_tx_hash = $4
          WHERE ticket_event_id = $1 AND token_id = $2
        `,
        [event.ticketEventId, tokenId, event.blockNumber, event.txHash],
      );
      return;
    }

    if (event.type === "sold") {
      const tokenId = event.tokenId.toString();
      await client.query(
        `
          UPDATE listing_state_items
          SET is_active = FALSE, updated_block = $3, updated_tx_hash = $4
          WHERE ticket_event_id = $1 AND token_id = $2
        `,
        [event.ticketEventId, tokenId, event.blockNumber, event.txHash],
      );
      await client.query(
        `
          INSERT INTO ticket_state_items (
            ticket_event_id,
            token_id,
            owner,
            used,
            token_uri,
            listed,
            listing_price_wei,
            updated_block,
            updated_tx_hash
          )
          VALUES ($1, $2, $3, FALSE, '', FALSE, NULL, $4, $5)
          ON CONFLICT (ticket_event_id, token_id) DO UPDATE
          SET owner = EXCLUDED.owner,
              listed = FALSE,
              listing_price_wei = NULL,
              updated_block = EXCLUDED.updated_block,
              updated_tx_hash = EXCLUDED.updated_tx_hash
        `,
        [event.ticketEventId, tokenId, event.buyer, event.blockNumber, event.txHash],
      );
      return;
    }

    if (event.type === "used") {
      const tokenId = event.tokenId.toString();
      const updated = await client.query(
        `
          UPDATE ticket_state_items
          SET used = TRUE,
              listed = FALSE,
              listing_price_wei = NULL,
              updated_block = $3,
              updated_tx_hash = $4
          WHERE ticket_event_id = $1 AND token_id = $2
        `,
        [event.ticketEventId, tokenId, event.blockNumber, event.txHash],
      );

      if (updated.rowCount === 0) {
        const contractSet = await this.getContractSet(event.ticketEventId);
        const [owner, tokenUri] = await Promise.all([
          contractSet.ticketContract.ownerOf(event.tokenId),
          contractSet.ticketContract.tokenURI(event.tokenId).catch(() => ""),
        ]);

        await client.query(
          `
            INSERT INTO ticket_state_items (
              ticket_event_id,
              token_id,
              owner,
              used,
              token_uri,
              listed,
              listing_price_wei,
              updated_block,
              updated_tx_hash
            )
            VALUES ($1, $2, $3, TRUE, $4, FALSE, NULL, $5, $6)
            ON CONFLICT (ticket_event_id, token_id) DO UPDATE
            SET owner = COALESCE(NULLIF(ticket_state_items.owner, ''), EXCLUDED.owner),
                used = TRUE,
                listed = FALSE,
                listing_price_wei = NULL,
                token_uri = CASE
                  WHEN EXCLUDED.token_uri = '' THEN ticket_state_items.token_uri
                  ELSE EXCLUDED.token_uri
                END,
                updated_block = EXCLUDED.updated_block,
                updated_tx_hash = EXCLUDED.updated_tx_hash
          `,
          [
            event.ticketEventId,
            tokenId,
            normalizeAddress(String(owner)),
            String(tokenUri),
            event.blockNumber,
            event.txHash,
          ],
        );
      }
    }
  }
}
