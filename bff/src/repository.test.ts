import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock("./db.js", () => dbMock);

import {
  getMarketStats,
  getOperationalSummary,
  getTicketsByOwner,
} from "./repository.js";

describe("repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes floor, median, max, average, and suggested list price from active listings", async () => {
    dbMock.pool.query.mockResolvedValueOnce({
      rows: [{ price_wei: "300" }, { price_wei: "100" }, { price_wei: "200" }],
    });

    const stats = await getMarketStats("main-event");

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

    const tickets = await getTicketsByOwner(
      "0x00000000000000000000000000000000000000AA",
      "main-event",
    );

    expect(tickets).toEqual(rows);
    expect(dbMock.pool.query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE ticket_event_id = $1 AND LOWER(owner) = LOWER($2)"),
      ["main-event", "0x00000000000000000000000000000000000000AA"],
    );
  });

  it("returns active role assignments and recent admin activity for an event", async () => {
    dbMock.pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            ticket_event_id: "main-event",
            contract_scope: "ticket",
            role_id: "0xrole",
            account: "0x00000000000000000000000000000000000000aa",
            granted_by: "0x00000000000000000000000000000000000000bb",
            is_active: true,
            updated_block: "42",
            updated_tx_hash: "0xgrant",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            activity_id: "main-event:0xgrant:0:ticket:role_granted",
            ticket_event_id: "main-event",
            contract_scope: "ticket",
            activity_type: "role_granted",
            role_id: "0xrole",
            account: "0x00000000000000000000000000000000000000aa",
            actor: "0x00000000000000000000000000000000000000bb",
            block_number: "42",
            log_index: 0,
            tx_hash: "0xgrant",
            block_timestamp: "1700000000",
          },
        ],
      });

    const summary = await getOperationalSummary("main-event");

    expect(summary).toEqual({
      roles: [
        {
          ticketEventId: "main-event",
          contractScope: "ticket",
          roleId: "0xrole",
          account: "0x00000000000000000000000000000000000000aa",
          grantedBy: "0x00000000000000000000000000000000000000bb",
          isActive: true,
          updatedBlock: 42,
          updatedTxHash: "0xgrant",
        },
      ],
      recentActivity: [
        {
          id: "main-event:0xgrant:0:ticket:role_granted",
          ticketEventId: "main-event",
          contractScope: "ticket",
          type: "role_granted",
          roleId: "0xrole",
          account: "0x00000000000000000000000000000000000000aa",
          actor: "0x00000000000000000000000000000000000000bb",
          blockNumber: 42,
          logIndex: 0,
          txHash: "0xgrant",
          timestamp: 1700000000,
        },
      ],
    });
  });
});
