import { parseEther } from "ethers";
import { describe, expect, it } from "vitest";

import { calculateMarketStats } from "./market";

describe("calculateMarketStats", () => {
  it("returns empty stats when no listing exists", () => {
    const stats = calculateMarketStats([], parseEther("0.1"));

    expect(stats).toEqual({
      listingCount: 0,
      floorPrice: null,
      medianPrice: null,
      maxPrice: null,
      averagePrice: null,
      suggestedListPrice: null,
    });
  });

  it("computes floor, median, average and max", () => {
    const stats = calculateMarketStats(
      [
        { tokenId: 1n, seller: "0x1", price: parseEther("0.09"), isActive: true },
        { tokenId: 2n, seller: "0x2", price: parseEther("0.05"), isActive: true },
        { tokenId: 3n, seller: "0x3", price: parseEther("0.08"), isActive: true },
        { tokenId: 4n, seller: "0x4", price: parseEther("0.10"), isActive: true },
      ],
      parseEther("0.1"),
    );

    expect(stats.floorPrice).toBe(parseEther("0.05"));
    expect(stats.medianPrice).toBe(parseEther("0.085"));
    expect(stats.maxPrice).toBe(parseEther("0.1"));
    expect(stats.averagePrice).toBe(parseEther("0.08"));
    expect(stats.suggestedListPrice).toBe(parseEther("0.085"));
  });

  it("caps suggested price by primary price", () => {
    const stats = calculateMarketStats(
      [
        { tokenId: 1n, seller: "0x1", price: parseEther("0.20"), isActive: true },
        { tokenId: 2n, seller: "0x2", price: parseEther("0.18"), isActive: true },
      ],
      parseEther("0.1"),
    );

    expect(stats.suggestedListPrice).toBe(parseEther("0.1"));
  });
});
