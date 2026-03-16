import { afterEach, describe, expect, it, vi } from "vitest";

import { BffClient, createBffClient } from "./bffClient";

describe("BffClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests JSON endpoints without browser cache revalidation", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                ticketEventId: "demo-event",
                name: "Demo Event",
                symbol: "DEMO",
                primaryPriceWei: "100",
                maxSupply: "10",
                treasury: "0x0000000000000000000000000000000000000001",
                admin: "0x0000000000000000000000000000000000000002",
                ticketNftAddress: "0x0000000000000000000000000000000000000003",
                marketplaceAddress: "0x0000000000000000000000000000000000000004",
                checkInRegistryAddress: "0x0000000000000000000000000000000000000005",
                deploymentBlock: 1,
                registeredAt: 2,
              },
            ],
            defaultEventId: "demo-event",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    const client = new BffClient("http://localhost:8787");
    const response = await client.listEvents();

    expect(response.defaultEventId).toBe("demo-event");
    expect(response.items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/v1/events",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      }),
    );
  });

  it("returns null when the base URL is missing", () => {
    expect(createBffClient(null)).toBeNull();
  });
});
