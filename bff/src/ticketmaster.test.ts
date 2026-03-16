import { describe, expect, it, vi } from "vitest";

import { fetchTicketmasterCandidates, normalizeTicketmasterEvent } from "./ticketmaster.js";

describe("ticketmaster", () => {
  it("normalizes a Ticketmaster event into a demo candidate", () => {
    const normalized = normalizeTicketmasterEvent(
      {
        id: "G5viZb2Xx-abc",
        name: "Grand Comedy Night",
        url: "https://www.ticketmaster.fr/event/grand-comedy-night",
        dates: {
          start: {
            dateTime: "2026-09-12T19:30:00Z",
          },
        },
        images: [
          { url: "https://images.example/wide.jpg", ratio: "16_9", width: 2048, height: 1152 },
          { url: "https://images.example/tall.jpg", ratio: "3_2", width: 640, height: 960 },
        ],
        classifications: [
          {
            segment: { name: "Arts & Theatre" },
            genre: { name: "Comedy" },
            subGenre: { name: "Stand Up" },
          },
        ],
        _embedded: {
          venues: [
            {
              name: "Olympia",
              city: { name: "Paris" },
              country: { countryCode: "FR" },
            },
          ],
        },
      },
      "FR",
    );

    expect(normalized).toEqual({
      source: "ticketmaster",
      sourceEventId: "G5viZb2Xx-abc",
      name: "Grand Comedy Night",
      startsAt: Date.parse("2026-09-12T19:30:00Z"),
      venueName: "Olympia",
      city: "Paris",
      countryCode: "FR",
      imageUrl: "https://images.example/wide.jpg",
      category: "Stand Up",
      sourceUrl: "https://www.ticketmaster.fr/event/grand-comedy-night",
      selectionBucket: "comedy",
    });
  });

  it("fetches FR and GB candidates from Ticketmaster search responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            events: [
              {
                id: "fr-1",
                name: "Paris Arena Show",
                dates: { start: { dateTime: "2026-08-01T19:00:00Z" } },
                classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
                images: [{ url: "https://images.example/fr.jpg", ratio: "16_9", width: 1200, height: 675 }],
                _embedded: { venues: [{ name: "Arena", city: { name: "Paris" }, country: { countryCode: "FR" } }] },
              },
            ],
          },
          page: { totalPages: 1 },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          _embedded: {
            events: [
              {
                id: "gb-1",
                name: "London Theatre Night",
                dates: { start: { dateTime: "2026-08-05T19:00:00Z" } },
                classifications: [{ segment: { name: "Arts & Theatre" }, genre: { name: "Theatre" } }],
                images: [{ url: "https://images.example/gb.jpg", ratio: "16_9", width: 1200, height: 675 }],
                _embedded: { venues: [{ name: "Hall", city: { name: "London" }, country: { countryCode: "GB" } }] },
              },
            ],
          },
          page: { totalPages: 1 },
        }),
      } as Response);

    const candidates = await fetchTicketmasterCandidates({
      apiKey: "demo-key",
      fetchImpl: fetchMock,
      now: Date.parse("2026-03-16T00:00:00Z"),
      windowDays: 180,
      pageSize: 50,
      maxPages: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(candidates.map((item) => item.sourceEventId)).toEqual(["fr-1", "gb-1"]);
    expect(candidates[0]?.selectionBucket).toBe("music");
    expect(candidates[1]?.selectionBucket).toBe("arts");
  });
});
