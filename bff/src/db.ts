import { Pool, type PoolClient } from "pg";

import { config } from "./config.js";
import { logger } from "./logger.js";
import type { DemoCatalogEntry, DemoLineupStatus } from "./types.js";

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

CREATE TABLE IF NOT EXISTS event_deployments (
  ticket_event_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  primary_price_wei TEXT NOT NULL,
  max_supply TEXT NOT NULL,
  treasury TEXT NOT NULL,
  admin TEXT NOT NULL,
  ticket_nft_address TEXT NOT NULL UNIQUE,
  marketplace_address TEXT NOT NULL UNIQUE,
  checkin_registry_address TEXT NOT NULL UNIQUE,
  deployment_block BIGINT NOT NULL,
  registered_at BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS indexed_event_log (
  chain_event_id TEXT PRIMARY KEY,
  ticket_event_id TEXT NOT NULL REFERENCES event_deployments(ticket_event_id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS indexed_event_log_ticket_token_block_idx
  ON indexed_event_log (ticket_event_id, token_id, block_number DESC, log_index DESC);

CREATE TABLE IF NOT EXISTS ticket_state_items (
  ticket_event_id TEXT NOT NULL REFERENCES event_deployments(ticket_event_id) ON DELETE CASCADE,
  token_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  token_uri TEXT NOT NULL DEFAULT '',
  listed BOOLEAN NOT NULL DEFAULT FALSE,
  listing_price_wei TEXT,
  updated_block BIGINT NOT NULL,
  updated_tx_hash TEXT NOT NULL,
  PRIMARY KEY (ticket_event_id, token_id)
);

CREATE INDEX IF NOT EXISTS ticket_state_items_owner_idx
  ON ticket_state_items (ticket_event_id, LOWER(owner));

CREATE TABLE IF NOT EXISTS listing_state_items (
  ticket_event_id TEXT NOT NULL REFERENCES event_deployments(ticket_event_id) ON DELETE CASCADE,
  token_id TEXT NOT NULL,
  seller TEXT NOT NULL,
  price_wei TEXT NOT NULL,
  is_active BOOLEAN NOT NULL,
  updated_block BIGINT NOT NULL,
  updated_tx_hash TEXT NOT NULL,
  PRIMARY KEY (ticket_event_id, token_id)
);

CREATE INDEX IF NOT EXISTS listing_state_items_active_idx
  ON listing_state_items (ticket_event_id, is_active, updated_block DESC);

CREATE TABLE IF NOT EXISTS ops_activity_log (
  activity_id TEXT PRIMARY KEY,
  ticket_event_id TEXT NOT NULL REFERENCES event_deployments(ticket_event_id) ON DELETE CASCADE,
  contract_scope TEXT NOT NULL,
  activity_type TEXT NOT NULL,
  role_id TEXT,
  account TEXT,
  actor TEXT,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  tx_hash TEXT NOT NULL,
  block_timestamp BIGINT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ops_activity_log_ticket_block_idx
  ON ops_activity_log (ticket_event_id, block_number DESC, log_index DESC);

CREATE TABLE IF NOT EXISTS role_state_items (
  ticket_event_id TEXT NOT NULL REFERENCES event_deployments(ticket_event_id) ON DELETE CASCADE,
  contract_scope TEXT NOT NULL,
  role_id TEXT NOT NULL,
  account TEXT NOT NULL,
  granted_by TEXT,
  is_active BOOLEAN NOT NULL,
  updated_block BIGINT NOT NULL,
  updated_tx_hash TEXT NOT NULL,
  PRIMARY KEY (ticket_event_id, contract_scope, role_id, account)
);

CREATE INDEX IF NOT EXISTS role_state_items_ticket_role_idx
  ON role_state_items (ticket_event_id, contract_scope, role_id, is_active, account);

CREATE TABLE IF NOT EXISTS demo_event_catalog (
  lineup_status TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  ticket_event_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  name TEXT NOT NULL,
  starts_at BIGINT,
  venue_name TEXT,
  city TEXT,
  country_code TEXT,
  image_url TEXT,
  category TEXT,
  source_url TEXT,
  fetched_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  demo_disclaimer TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lineup_status, slot_index),
  CONSTRAINT demo_event_catalog_status_check
    CHECK (lineup_status IN ('active', 'staged'))
);

CREATE UNIQUE INDEX IF NOT EXISTS demo_event_catalog_status_event_idx
  ON demo_event_catalog (lineup_status, ticket_event_id);

CREATE UNIQUE INDEX IF NOT EXISTS demo_event_catalog_status_source_idx
  ON demo_event_catalog (lineup_status, source_event_id);
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
  await client.query("TRUNCATE TABLE indexed_event_log");
  await client.query("TRUNCATE TABLE ticket_state_items");
  await client.query("TRUNCATE TABLE listing_state_items");
  await client.query("TRUNCATE TABLE ops_activity_log");
  await client.query("TRUNCATE TABLE role_state_items");
  await client.query(
    "DELETE FROM chain_state WHERE key IN ('last_indexed_block', 'last_indexed_hash')",
  );
}

export interface EventDeploymentRow {
  ticket_event_id: string;
  name: string;
  symbol: string;
  primary_price_wei: string;
  max_supply: string;
  treasury: string;
  admin: string;
  ticket_nft_address: string;
  marketplace_address: string;
  checkin_registry_address: string;
  deployment_block: string;
  registered_at: string;
}

export async function upsertEventDeployment(
  client: PoolClient,
  deployment: EventDeploymentRow,
): Promise<void> {
  await client.query(
    `
      INSERT INTO event_deployments (
        ticket_event_id,
        name,
        symbol,
        primary_price_wei,
        max_supply,
        treasury,
        admin,
        ticket_nft_address,
        marketplace_address,
        checkin_registry_address,
        deployment_block,
        registered_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (ticket_event_id) DO UPDATE
      SET name = EXCLUDED.name,
          symbol = EXCLUDED.symbol,
          primary_price_wei = EXCLUDED.primary_price_wei,
          max_supply = EXCLUDED.max_supply,
          treasury = EXCLUDED.treasury,
          admin = EXCLUDED.admin,
          ticket_nft_address = EXCLUDED.ticket_nft_address,
          marketplace_address = EXCLUDED.marketplace_address,
          checkin_registry_address = EXCLUDED.checkin_registry_address,
          deployment_block = EXCLUDED.deployment_block,
          registered_at = EXCLUDED.registered_at,
          updated_at = NOW()
    `,
    [
      deployment.ticket_event_id,
      deployment.name,
      deployment.symbol,
      deployment.primary_price_wei,
      deployment.max_supply,
      deployment.treasury,
      deployment.admin,
      deployment.ticket_nft_address,
      deployment.marketplace_address,
      deployment.checkin_registry_address,
      deployment.deployment_block,
      deployment.registered_at,
    ],
  );
}

export async function getEventDeployments(): Promise<EventDeploymentRow[]> {
  const result = await pool.query<EventDeploymentRow>(
    `
      SELECT
        ticket_event_id,
        name,
        symbol,
        primary_price_wei,
        max_supply,
        treasury,
        admin,
        ticket_nft_address,
        marketplace_address,
        checkin_registry_address,
        deployment_block,
        registered_at
      FROM event_deployments
      ORDER BY deployment_block ASC, ticket_event_id ASC
    `,
  );

  return result.rows;
}

export async function replaceDemoCatalogEntries(
  client: PoolClient,
  lineupStatus: DemoLineupStatus,
  entries: DemoCatalogEntry[],
): Promise<void> {
  await client.query("DELETE FROM demo_event_catalog WHERE lineup_status = $1", [lineupStatus]);

  for (const entry of entries) {
    await client.query(
      `
        INSERT INTO demo_event_catalog (
          lineup_status,
          slot_index,
          ticket_event_id,
          source,
          source_event_id,
          name,
          starts_at,
          venue_name,
          city,
          country_code,
          image_url,
          category,
          source_url,
          fetched_at,
          expires_at,
          demo_disclaimer
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
      `,
      [
        lineupStatus,
        entry.slotIndex,
        entry.ticketEventId,
        entry.source,
        entry.sourceEventId,
        entry.name,
        entry.startsAt,
        entry.venueName,
        entry.city,
        entry.countryCode,
        entry.imageUrl,
        entry.category,
        entry.sourceUrl,
        entry.fetchedAt,
        entry.expiresAt,
        entry.demoDisclaimer,
      ],
    );
  }
}

export async function promoteStagedDemoCatalog(client: PoolClient): Promise<void> {
  await client.query("DELETE FROM demo_event_catalog WHERE lineup_status = 'active'");
  await client.query(
    `
      UPDATE demo_event_catalog
      SET lineup_status = 'active',
          updated_at = NOW()
      WHERE lineup_status = 'staged'
    `,
  );
}
