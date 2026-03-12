import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock("./db.js", () => dbMock);

import { getMarketStats, getTicketsByOwner } from "./repository.js";

describe("repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes floor, median, max, average, and suggested list price from active listings", async () => {
    dbMock.pool.query.mockResolvedValueOnce({
      rows: [{ price_wei: "300" }, { price_wei: "100" }, { price_wei: "200" }],
    });

    const stats = await getMarketStats();

    expect(stats).toEqual({
      listingCount: 3,
      floorPriceWei: "100",
      medianPriceWei: "200",
      maxPriceWei: "300",
      averagePriceWei: "200",
      suggestedListPriceWei: "200",
    });
  });

  it("returns stored tickets for the requested owner address", async () => {
    const rows = [
      {
        token_id: "7",
        owner: "0x00000000000000000000000000000000000000aa",
        used: true,
        token_uri: "ipfs://ticket/7.json",
        listed: false,
        listing_price_wei: null,
      },
    ];

    dbMock.pool.query.mockResolvedValueOnce({ rows });

    const tickets = await getTicketsByOwner("0x00000000000000000000000000000000000000AA");

    expect(tickets).toEqual(rows);
    expect(dbMock.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE LOWER(owner) = LOWER($1)"),
      ["0x00000000000000000000000000000000000000AA"],
    );
  });
});
