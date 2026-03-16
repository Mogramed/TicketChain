import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address");
const runtimeMode = (process.env.BFF_RUNTIME_MODE ?? "server").trim().toLowerCase();

const schema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AMOY_RPC_URL: z.string().url("AMOY_RPC_URL must be a valid URL"),
  CHAIN_ID: z.coerce.number().int().positive().default(80002),
  DEPLOYMENT_BLOCK: z.coerce.number().int().nonnegative().default(0),
  DEFAULT_EVENT_ID: z.string().min(1).default("main-event"),
  FACTORY_ADDRESS: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine((value) => value === null || addressSchema.safeParse(value).success, {
      message: "Invalid FACTORY_ADDRESS",
    }),
  TICKET_NFT_ADDRESS: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine((value) => value === null || addressSchema.safeParse(value).success, {
      message: "Invalid TICKET_NFT_ADDRESS",
    }),
  MARKETPLACE_ADDRESS: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine((value) => value === null || addressSchema.safeParse(value).success, {
      message: "Invalid MARKETPLACE_ADDRESS",
    }),
  CHECKIN_REGISTRY_ADDRESS: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    })
    .refine((value) => value === null || addressSchema.safeParse(value).success, {
      message: "Invalid CHECKIN_REGISTRY_ADDRESS",
    }),
  INDEXER_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  INDEXER_MIN_BATCH_SIZE: z.coerce.number().int().positive().default(60),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(8000),
  INDEXER_INTER_BATCH_DELAY_MS: z.coerce.number().int().nonnegative().default(500),
  INDEXER_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(0),
  INDEXER_RATE_LIMIT_COOLDOWN_MS: z.coerce.number().int().positive().default(8000),
  INDEXER_MAX_BACKOFF_MS: z.coerce.number().int().positive().default(120000),
  INDEXER_MAX_CONSECUTIVE_RATE_LIMITS: z.coerce.number().int().positive().default(8),
  INDEXER_STOP_ON_MAX_RATE_LIMIT: z.preprocess(
    (value) => {
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized === "true" || normalized === "1" || normalized === "yes";
      }
      return false;
    },
    z.boolean(),
  ),
  HEALTH_LAG_WARN_BLOCKS: z.coerce.number().int().nonnegative().default(20),
  HEALTH_LAG_CRITICAL_BLOCKS: z.coerce.number().int().nonnegative().default(60),
  HEALTH_STALL_WARN_MS: z.coerce.number().int().nonnegative().default(60000),
  HEALTH_STALL_CRITICAL_MS: z.coerce.number().int().nonnegative().default(180000),
  HEALTH_RATE_LIMIT_STREAK_WARN: z.coerce.number().int().nonnegative().default(3),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  TICKETMASTER_DISCOVERY_API_KEY: z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    }),
  TICKETMASTER_DISCOVERY_BASE_URL: z
    .string()
    .url("TICKETMASTER_DISCOVERY_BASE_URL must be a valid URL")
    .default("https://app.ticketmaster.com"),
  DEMO_LINEUP_WINDOW_DAYS: z.coerce.number().int().positive().default(180),
  DEMO_LINEUP_PAGE_SIZE: z.coerce.number().int().positive().default(100),
  DEMO_LINEUP_MAX_PAGES: z.coerce.number().int().positive().default(2),
  DEMO_LINEUP_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid BFF environment configuration:\n- ${issues.join("\n- ")}`);
}

const env = parsed.data;

const hasLegacyAddresses =
  env.TICKET_NFT_ADDRESS !== null &&
  env.MARKETPLACE_ADDRESS !== null &&
  env.CHECKIN_REGISTRY_ADDRESS !== null;
const requiresChainCatalogConfig = runtimeMode === "server";

if (requiresChainCatalogConfig && !env.FACTORY_ADDRESS && !hasLegacyAddresses) {
  throw new Error(
    "Invalid BFF environment configuration:\n- Provide FACTORY_ADDRESS for multi-event mode or the legacy TICKET_NFT_ADDRESS, MARKETPLACE_ADDRESS, and CHECKIN_REGISTRY_ADDRESS values.",
  );
}

if (requiresChainCatalogConfig && hasLegacyAddresses && env.DEPLOYMENT_BLOCK <= 0) {
  throw new Error(
    "Invalid BFF environment configuration:\n- DEPLOYMENT_BLOCK must be greater than 0 when legacy single-event contract addresses are configured.",
  );
}

export const config = {
  runtimeMode,
  nodeEnv: env.NODE_ENV ?? "development",
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  rpcUrl: env.AMOY_RPC_URL,
  chainId: env.CHAIN_ID,
  deploymentBlock: env.DEPLOYMENT_BLOCK,
  defaultEventId: env.DEFAULT_EVENT_ID,
  factoryAddress: env.FACTORY_ADDRESS,
  ticketNftAddress: env.TICKET_NFT_ADDRESS,
  marketplaceAddress: env.MARKETPLACE_ADDRESS,
  checkInRegistryAddress: env.CHECKIN_REGISTRY_ADDRESS,
  indexerBatchSize: env.INDEXER_BATCH_SIZE,
  indexerMinBatchSize: env.INDEXER_MIN_BATCH_SIZE,
  indexerPollIntervalMs: env.INDEXER_POLL_INTERVAL_MS,
  indexerInterBatchDelayMs: env.INDEXER_INTER_BATCH_DELAY_MS,
  indexerConfirmations: env.INDEXER_CONFIRMATIONS,
  indexerRateLimitCooldownMs: env.INDEXER_RATE_LIMIT_COOLDOWN_MS,
  indexerMaxBackoffMs: env.INDEXER_MAX_BACKOFF_MS,
  indexerMaxConsecutiveRateLimits: env.INDEXER_MAX_CONSECUTIVE_RATE_LIMITS,
  indexerStopOnMaxRateLimit: env.INDEXER_STOP_ON_MAX_RATE_LIMIT,
  healthLagWarnBlocks: env.HEALTH_LAG_WARN_BLOCKS,
  healthLagCriticalBlocks: env.HEALTH_LAG_CRITICAL_BLOCKS,
  healthStallWarnMs: env.HEALTH_STALL_WARN_MS,
  healthStallCriticalMs: env.HEALTH_STALL_CRITICAL_MS,
  healthRateLimitStreakWarn: env.HEALTH_RATE_LIMIT_STREAK_WARN,
  corsOrigins: env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  rateLimitMax: env.RATE_LIMIT_MAX,
  ticketmasterDiscoveryApiKey: env.TICKETMASTER_DISCOVERY_API_KEY,
  ticketmasterDiscoveryBaseUrl: env.TICKETMASTER_DISCOVERY_BASE_URL,
  demoLineupWindowDays: env.DEMO_LINEUP_WINDOW_DAYS,
  demoLineupPageSize: env.DEMO_LINEUP_PAGE_SIZE,
  demoLineupMaxPages: env.DEMO_LINEUP_MAX_PAGES,
  demoLineupCacheTtlHours: env.DEMO_LINEUP_CACHE_TTL_HOURS,
} as const;

export type AppConfig = typeof config;
