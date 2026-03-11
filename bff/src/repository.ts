import { pool } from "./db.js";

export type ListingSort = "price_asc" | "price_desc" | "recent";

interface ListingRow {
  token_id: string;
  seller: string;
  price_wei: string;
  is_active: boolean;
  updated_block: string;
}

interface TicketRow {
  token_id: string;
  owner: string;
  used: boolean;
  token_uri: string;
  listed: boolean;
  listing_price_wei: string | null;
}

interface TimelineRow {
  event_id: string;
  event_type: string;
  token_id: string | null;
  block_number: string;
  tx_hash: string;
  block_timestamp: string | null;
  actor_from: string | null;
  actor_to: string | null;
  seller: string | null;
  buyer: string | null;
  scanner: string | null;
  price_wei: string | null;
  fee_amount_wei: string | null;
  collectible_enabled: boolean | null;
}

export async function getIndexedBlock(): Promise<number> {
  const result = await pool.query<{ value: string }>(
    "SELECT value FROM chain_state WHERE key = 'last_indexed_block'",
  );

  const raw = result.rows[0]?.value;
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getLatestProcessedBlockHash(
  blockNumber: number,
): Promise<string | null> {
  const result = await pool.query<{ block_hash: string }>(
    "SELECT block_hash FROM processed_blocks WHERE block_number = $1",
    [blockNumber],
  );

  return result.rows[0]?.block_hash ?? null;
}

export async function getActiveListings(params: {
  sort: ListingSort;
  limit: number;
  offset: number;
}): Promise<{ items: ListingRow[]; total: number }> {
  const orderBy =
    params.sort === "price_asc"
      ? "price_wei::numeric ASC, updated_block DESC"
      : params.sort === "price_desc"
        ? "price_wei::numeric DESC, updated_block DESC"
        : "updated_block DESC, token_id::numeric DESC";

  const [itemsResult, totalResult] = await Promise.all([
    pool.query<ListingRow>(
      `
        SELECT token_id, seller, price_wei, is_active, updated_block
        FROM listing_state
        WHERE is_active = TRUE
        ORDER BY ${orderBy}
        LIMIT $1 OFFSET $2
      `,
      [params.limit, params.offset],
    ),
    pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM listing_state WHERE is_active = TRUE",
    ),
  ]);

  return {
    items: itemsResult.rows,
    total: Number(totalResult.rows[0]?.count ?? "0"),
  };
}

function median(values: bigint[]): bigint | null {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2n;
}

export async function getMarketStats(): Promise<{
  listingCount: number;
  floorPriceWei: string | null;
  medianPriceWei: string | null;
  maxPriceWei: string | null;
  averagePriceWei: string | null;
  suggestedListPriceWei: string | null;
}> {
  const result = await pool.query<{ price_wei: string }>(
    "SELECT price_wei FROM listing_state WHERE is_active = TRUE",
  );

  if (!result.rows.length) {
    return {
      listingCount: 0,
      floorPriceWei: null,
      medianPriceWei: null,
      maxPriceWei: null,
      averagePriceWei: null,
      suggestedListPriceWei: null,
    };
  }

  const prices = result.rows.map((row) => BigInt(row.price_wei));
  const sorted = [...prices].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const total = prices.reduce((acc, price) => acc + price, 0n);
  const floor = sorted[0] ?? null;
  const max = sorted[sorted.length - 1] ?? null;
  const med = median(sorted);
  const avg = total / BigInt(prices.length);

  return {
    listingCount: prices.length,
    floorPriceWei: floor?.toString() ?? null,
    medianPriceWei: med?.toString() ?? null,
    maxPriceWei: max?.toString() ?? null,
    averagePriceWei: avg.toString(),
    suggestedListPriceWei: med?.toString() ?? floor?.toString() ?? null,
  };
}

export async function getTicketsByOwner(address: string): Promise<TicketRow[]> {
  const result = await pool.query<TicketRow>(
    `
      SELECT token_id, owner, used, token_uri, listed, listing_price_wei
      FROM ticket_state
      WHERE LOWER(owner) = LOWER($1)
      ORDER BY token_id::numeric ASC
    `,
    [address],
  );

  return result.rows;
}

export async function getTicketTimeline(tokenId: string): Promise<TimelineRow[]> {
  const result = await pool.query<TimelineRow>(
    `
      SELECT
        event_id,
        event_type,
        token_id,
        block_number,
        tx_hash,
        block_timestamp,
        actor_from,
        actor_to,
        seller,
        buyer,
        scanner,
        price_wei,
        fee_amount_wei,
        collectible_enabled
      FROM indexed_events
      WHERE token_id = $1 OR (token_id IS NULL AND event_type = 'collectible_mode')
      ORDER BY block_number DESC, log_index DESC
      LIMIT 400
    `,
    [tokenId],
  );

  return result.rows;
}
