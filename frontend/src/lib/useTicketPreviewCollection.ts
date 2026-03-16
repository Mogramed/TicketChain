import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

import type { TicketPreviewState } from "../types/chainticket";
import {
  buildTicketPreviewState,
  fetchTicketMetadata,
} from "./ticketMetadata";

interface PreviewDescriptor {
  key: string;
  tokenId: bigint;
  ticketEventId?: string;
  activeTokenUri: string;
  activeView: "live" | "collectible";
  liveTokenUri: string | null;
  collectibleTokenUri: string | null;
}

export function useTicketPreviewCollection(
  descriptors: PreviewDescriptor[],
): Map<string, TicketPreviewState> {
  const uniqueUris = useMemo(() => {
    const values = new Set<string>();

    for (const descriptor of descriptors) {
      if (descriptor.activeTokenUri) {
        values.add(descriptor.activeTokenUri);
      }
      if (descriptor.liveTokenUri) {
        values.add(descriptor.liveTokenUri);
      }
      if (descriptor.collectibleTokenUri) {
        values.add(descriptor.collectibleTokenUri);
      }
    }

    return [...values];
  }, [descriptors]);

  const metadataQueries = useQueries({
    queries: uniqueUris.map((tokenUri) => ({
      queryKey: ["ticket-metadata", tokenUri],
      enabled: tokenUri.length > 0,
      retry: 1,
      staleTime: 5 * 60_000,
      queryFn: async () => fetchTicketMetadata(tokenUri),
    })),
  });

  const metadataByUri = useMemo(() => {
    const entries = new Map<string, (typeof metadataQueries)[number]>();

    uniqueUris.forEach((tokenUri, index) => {
      const query = metadataQueries[index];
      if (query) {
        entries.set(tokenUri, query);
      }
    });

    return entries;
  }, [metadataQueries, uniqueUris]);

  return useMemo(() => {
    const previews = new Map<string, TicketPreviewState>();

    for (const descriptor of descriptors) {
      const activeQuery = metadataByUri.get(descriptor.activeTokenUri);
      const liveQuery = descriptor.liveTokenUri
        ? metadataByUri.get(descriptor.liveTokenUri)
        : undefined;
      const collectibleQuery = descriptor.collectibleTokenUri
        ? metadataByUri.get(descriptor.collectibleTokenUri)
        : undefined;
      const currentError =
        activeQuery?.error instanceof Error ? activeQuery.error.message : null;
      const liveError =
        liveQuery?.error instanceof Error ? liveQuery.error.message : null;
      const collectibleError =
        collectibleQuery?.error instanceof Error
          ? collectibleQuery.error.message
          : null;

      previews.set(
        descriptor.key,
        buildTicketPreviewState({
          tokenId: descriptor.tokenId,
          ticketEventId: descriptor.ticketEventId,
          activeTokenUri: descriptor.activeTokenUri,
          activeView: descriptor.activeView,
          liveTokenUri: descriptor.liveTokenUri,
          collectibleTokenUri: descriptor.collectibleTokenUri,
          liveMetadata: descriptor.liveTokenUri
            ? liveQuery?.data ?? null
            : null,
          collectibleMetadata: descriptor.collectibleTokenUri
            ? collectibleQuery?.data ?? null
            : null,
          isLoading: Boolean(
            activeQuery?.isLoading ||
              activeQuery?.isFetching ||
              liveQuery?.isLoading ||
              liveQuery?.isFetching ||
              collectibleQuery?.isLoading ||
              collectibleQuery?.isFetching,
          ),
          errorMessage: currentError ?? liveError ?? collectibleError,
        }),
      );
    }

    return previews;
  }, [descriptors, metadataByUri]);
}
