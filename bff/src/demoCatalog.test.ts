import { describe, expect, it } from "vitest";

import {
  DEMO_PASS_DISCLAIMER,
  buildDemoEventId,
  mergeDemoCatalogEntries,
  selectDemoLineup,
  type DemoEventCandidate,
} from "./demoCatalog.js";

function candidate(
  overrides: Partial<DemoEventCandidate> & Pick<DemoEventCandidate, "sourceEventId" | "name">,
): DemoEventCandidate {
  return {
    source: "ticketmaster",
    sourceEventId: overrides.sourceEventId,
    name: overrides.name,
    startsAt: overrides.startsAt ?? Date.parse("2026-07-01T18:00:00Z"),
    venueName: overrides.venueName ?? "Arena",
    city: overrides.city ?? "Paris",
    countryCode: overrides.countryCode ?? "FR",
    imageUrl: overrides.imageUrl ?? "https://images.example/poster.jpg",
    category: overrides.category ?? "Music",
    sourceUrl: overrides.sourceUrl ?? "https://ticketmaster.example/event",
    selectionBucket: overrides.selectionBucket ?? "music",
  };
}

describe("demoCatalog", () => {
  it("builds deterministic demo event ids from the source event", () => {
    const first = candidate({
      sourceEventId: "tm-123",
      name: "Beyonce World Tour",
      startsAt: Date.parse("2026-07-14T18:00:00Z"),
    });
    const second = candidate({
      sourceEventId: "tm-123",
      name: "Beyonce World Tour",
      startsAt: Date.parse("2026-07-14T18:00:00Z"),
    });

    expect(buildDemoEventId(first)).toBe(buildDemoEventId(second));
    expect(buildDemoEventId(first)).toContain("demo-fr-beyonce-world-tour-20260714");
  });

  it("selects a 5-event lineup with the required category mix and preserves country priority", () => {
    const lineup = selectDemoLineup(
      [
        candidate({
          sourceEventId: "music-fr-1",
          name: "Paris Pop Night",
          selectionBucket: "music",
          countryCode: "FR",
          startsAt: Date.parse("2026-06-01T18:00:00Z"),
        }),
        candidate({ sourceEventId: "music-gb-1", name: "London Rock Night", selectionBucket: "music", countryCode: "GB" }),
        candidate({ sourceEventId: "arts-fr-1", name: "Hamlet", selectionBucket: "arts", category: "Arts & Theatre" }),
        candidate({ sourceEventId: "comedy-gb-1", name: "Stand-up Royal", selectionBucket: "comedy", category: "Comedy", countryCode: "GB" }),
        candidate({ sourceEventId: "flex-fr-1", name: "Family Spectacle", selectionBucket: "flex", category: "Family" }),
        candidate({
          sourceEventId: "music-fr-2",
          name: "Arena Closing Show",
          selectionBucket: "music",
          countryCode: "FR",
          startsAt: Date.parse("2026-06-10T18:00:00Z"),
        }),
      ],
      {
        fetchedAt: 1_780_000_000_000,
        expiresAt: 1_780_086_400_000,
      },
    );

    expect(lineup).toHaveLength(5);
    expect(lineup.map((item) => item.slotIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(lineup[0]?.sourceEventId).toBe("music-fr-1");
    expect(lineup[1]?.sourceEventId).toBe("music-fr-2");
    expect(lineup[2]?.sourceEventId).toBe("arts-fr-1");
    expect(lineup[3]?.sourceEventId).toBe("comedy-gb-1");
    expect(lineup[4]?.sourceEventId).toBe("flex-fr-1");
    expect(lineup.every((item) => item.demoDisclaimer === DEMO_PASS_DISCLAIMER)).toBe(true);
  });

  it("merges editorial metadata only for active demo events and preserves lineup order", () => {
    const deployments = [
      {
        ticketEventId: "demo-one",
        name: "On-chain One",
        symbol: "CT1",
        primaryPriceWei: "1",
        maxSupply: "2",
        treasury: "0x1",
        admin: "0x2",
        ticketNftAddress: "0x3",
        marketplaceAddress: "0x4",
        checkInRegistryAddress: "0x5",
        deploymentBlock: 100,
        registeredAt: 200,
      },
      {
        ticketEventId: "demo-two",
        name: "On-chain Two",
        symbol: "CT2",
        primaryPriceWei: "1",
        maxSupply: "2",
        treasury: "0x1",
        admin: "0x2",
        ticketNftAddress: "0x3",
        marketplaceAddress: "0x4",
        checkInRegistryAddress: "0x5",
        deploymentBlock: 100,
        registeredAt: 200,
      },
    ];

    const merged = mergeDemoCatalogEntries(deployments, [
      {
        lineupStatus: "active",
        slotIndex: 0,
        ticketEventId: "demo-two",
        source: "ticketmaster",
        sourceEventId: "tm-2",
        name: "Editorial Two",
        startsAt: 1,
        venueName: "Venue Two",
        city: "London",
        countryCode: "GB",
        imageUrl: "https://images.example/two.jpg",
        category: "Comedy",
        sourceUrl: "https://ticketmaster.example/two",
        fetchedAt: 2,
        expiresAt: 3,
        demoDisclaimer: DEMO_PASS_DISCLAIMER,
      },
      {
        lineupStatus: "active",
        slotIndex: 1,
        ticketEventId: "demo-one",
        source: "ticketmaster",
        sourceEventId: "tm-1",
        name: "Editorial One",
        startsAt: 1,
        venueName: "Venue One",
        city: "Paris",
        countryCode: "FR",
        imageUrl: "https://images.example/one.jpg",
        category: "Music",
        sourceUrl: "https://ticketmaster.example/one",
        fetchedAt: 2,
        expiresAt: 3,
        demoDisclaimer: DEMO_PASS_DISCLAIMER,
      },
    ]);

    expect(merged.map((item) => item.ticketEventId)).toEqual(["demo-two", "demo-one"]);
    expect(merged[0]).toMatchObject({
      name: "On-chain Two",
      isDemoInspired: true,
      sourceEventId: "tm-2",
      venueName: "Venue Two",
    });
  });
});
