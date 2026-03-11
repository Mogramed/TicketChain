import type { MarketplaceView, MarketStats } from "../types/chainticket";

function sortBigints(values: bigint[]): bigint[] {
  return [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

function median(values: bigint[]): bigint | null {
  if (!values.length) {
    return null;
  }

  const sorted = sortBigints(values);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2n;
}

export function calculateMarketStats(
  listings: MarketplaceView[],
  primaryPrice: bigint | null,
): MarketStats {
  if (!listings.length) {
    return {
      listingCount: 0,
      floorPrice: null,
      medianPrice: null,
      maxPrice: null,
      averagePrice: null,
      suggestedListPrice: null,
    };
  }

  const prices = sortBigints(listings.map((listing) => listing.price));
  const floorPrice = prices[0] ?? null;
  const maxPrice = prices[prices.length - 1] ?? null;
  const medianPrice = median(prices);
  const sum = prices.reduce((accumulator, price) => accumulator + price, 0n);
  const averagePrice = sum / BigInt(prices.length);

  let suggestedListPrice: bigint | null = medianPrice ?? floorPrice ?? null;
  if (primaryPrice !== null && suggestedListPrice !== null && suggestedListPrice > primaryPrice) {
    suggestedListPrice = primaryPrice;
  }

  return {
    listingCount: listings.length,
    floorPrice,
    medianPrice,
    maxPrice,
    averagePrice,
    suggestedListPrice,
  };
}
