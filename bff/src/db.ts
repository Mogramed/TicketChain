import { Pool, type PoolClient } from "pg";

import { config } from "./config.js";
import { logger } from "./logger.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

const schemaSql = `
CREATE TABLE IF NOT EXISTS chain_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_blocks (
  block_number BIGINT PRIMARY KEY,
  block_hash TEXT NOT NULL,
  parent_hash TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexed_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  token_id TEXT,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  actor_from TEXT,
  actor_to TEXT,
  seller TEXT,
  buyer TEXT,
  scanner TEXT,
  price_wei TEXT,
  fee_amount_wei TEXT,
  collectible_enabled BOOLEAN,
  block_timestamp BIGINT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS indexed_events_token_block_idx
  ON indexed_events (token_id, block_number DESC, log_index DESC);

CREATE TABLE IF NOT EXISTS ticket_state (
  token_id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  token_uri TEXT NOT NULL DEFAULT '',
  listed BOOLEAN NOT NULL DEFAULT FALSE,
  listing_price_wei TEXT,
  updated_block BIGINT NOT NULL,
  updated_tx_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ticket_state_owner_idx
  ON ticket_state (LOWER(owner));

CREATE TABLE IF NOT EXISTS listing_state (
  token_id TEXT PRIMARY KEY,
  seller TEXT NOT NULL,
  price_wei TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  updated_block BIGINT NOT NULL,
  updated_tx_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS listing_state_active_idx
  ON listing_state (is_active, updated_block DESC);
`;

export async function initDatabase(): Promise<void> {
  await pool.query(schemaSql);
  logger.info("Postgres schema is ready.");
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getChainStateNumber(key: string, fallback: number): Promise<number> {
  const result = await pool.query<{ value: string }>(
    "SELECT value FROM chain_state WHERE key = $1",
    [key],
  );

  const raw = result.rows[0]?.value;
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getChainStateString(key: string): Promise<string | null> {
  const result = await pool.query<{ value: string }>(
    "SELECT value FROM chain_state WHERE key = $1",
    [key],
  );
  return result.rows[0]?.value ?? null;
}

export async function setChainStateNumber(
  client: PoolClient,
  key: string,
  value: number,
): Promise<void> {
  await client.query(
    `
      INSERT INTO chain_state (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
    `,
    [key, String(value)],
  );
}

export async function setChainStateString(
  client: PoolClient,
  key: string,
  value: string,
): Promise<void> {
  await client.query(
    `
      INSERT INTO chain_state (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value
    `,
    [key, value],
  );
}

export async function resetIndexedState(client: PoolClient): Promise<void> {
  await client.query("TRUNCATE TABLE processed_blocks");
  await client.query("TRUNCATE TABLE indexed_events");
  await client.query("TRUNCATE TABLE ticket_state");
  await client.query("TRUNCATE TABLE listing_state");
  await client.query(
    "DELETE FROM chain_state WHERE key IN ('last_indexed_block', 'last_indexed_hash')",
  );
}
