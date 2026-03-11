import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AMOY_RPC_URL: z.string().url("AMOY_RPC_URL must be a valid URL"),
  CHAIN_ID: z.coerce.number().int().positive().default(80002),
  DEPLOYMENT_BLOCK: z.coerce.number().int().nonnegative().default(0),
  TICKET_NFT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid TICKET_NFT_ADDRESS"),
  MARKETPLACE_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid MARKETPLACE_ADDRESS"),
  CHECKIN_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid CHECKIN_REGISTRY_ADDRESS"),
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
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Invalid BFF environment configuration:\n- ${issues.join("\n- ")}`);
}

const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV ?? "development",
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  rpcUrl: env.AMOY_RPC_URL,
  chainId: env.CHAIN_ID,
  deploymentBlock: env.DEPLOYMENT_BLOCK,
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
  corsOrigins: env.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  rateLimitMax: env.RATE_LIMIT_MAX,
} as const;

export type AppConfig = typeof config;
