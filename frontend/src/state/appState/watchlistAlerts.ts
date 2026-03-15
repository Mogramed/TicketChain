import { useCallback, useEffect, useRef, useState } from "react";

import { loadWatchlist, saveWatchlist } from "../../lib/watchlistStorage";
import type { MarketplaceView } from "../../types/chainticket";

export function useWatchlistAlerts(ticketEventId: string, listings: MarketplaceView[]) {
  const [watchlist, setWatchlist] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set<string>() : loadWatchlist(),
  );
  const [watchAlerts, setWatchAlerts] = useState<string[]>([]);
  const previousListingsRef = useRef<Map<string, bigint>>(new Map());

  useEffect(() => {
    const nextMap = new Map<string, bigint>();
    const generatedAlerts: string[] = [];

    for (const listing of listings) {
      const tokenKey = `${ticketEventId}:${listing.tokenId.toString()}`;
      nextMap.set(tokenKey, listing.price);

      if (!watchlist.has(tokenKey)) {
        continue;
      }

      const previousPrice = previousListingsRef.current.get(tokenKey);
      if (previousPrice === undefined) {
        generatedAlerts.push(`Watched ticket ${tokenKey} is now listed.`);
      } else if (listing.price < previousPrice) {
        generatedAlerts.push(`Price drop on watched ticket ${tokenKey}.`);
      }
    }

    previousListingsRef.current = nextMap;

    if (generatedAlerts.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWatchAlerts((prev) => [...generatedAlerts, ...prev].slice(0, 20));
    }
  }, [listings, ticketEventId, watchlist]);

  const toggleWatch = useCallback((tokenId: bigint) => {
    setWatchlist((current) => {
      const next = new Set(current);
      const key = `${ticketEventId}:${tokenId.toString()}`;

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      saveWatchlist(next);
      return next;
    });
  }, [ticketEventId]);

  return {
    watchlist,
    watchAlerts,
    toggleWatch,
  };
}
