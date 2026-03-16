import type {
  TicketAttribute,
  TicketMediaAsset,
  TicketMetadata,
  TicketPreviewState,
} from "../types/chainticket";

const DEFAULT_IPFS_GATEWAY = "https://ipfs.io/ipfs/";
const METADATA_TIMEOUT_MS = 4_500;
const CID_V0_PATTERN = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1_PATTERN = /^b[a-z2-7]+$/;

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAttributeValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function resolveGatewayUrl(uri: string | null | undefined): string | null {
  const normalized = toStringOrNull(uri);
  if (!normalized) {
    return null;
  }

  if (
    normalized.startsWith("https://") ||
    normalized.startsWith("http://") ||
    normalized.startsWith("data:")
  ) {
    return normalized;
  }

  if (!normalized.startsWith("ipfs://")) {
    return normalized;
  }

  const path = normalized.slice("ipfs://".length).replace(/^ipfs\//i, "");
  const root = path.split("/")[0] ?? "";
  const isValidCid =
    CID_V0_PATTERN.test(root) || CID_V1_PATTERN.test(root.toLowerCase());

  if (!isValidCid) {
    return null;
  }

  return `${DEFAULT_IPFS_GATEWAY}${path}`;
}

export function buildTokenUriFromBase(
  baseUri: string | null | undefined,
  tokenId: bigint,
): string | null {
  const normalized = toStringOrNull(baseUri);
  if (!normalized) {
    return null;
  }

  return `${normalized}${tokenId.toString()}.json`;
}

export function parseTicketMetadata(
  payload: unknown,
  tokenUri: string,
): TicketMetadata {
  const value =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rawAttributes = Array.isArray(value.attributes) ? value.attributes : [];

  return {
    tokenUri,
    name: toStringOrNull(value.name),
    description: toStringOrNull(value.description),
    image: resolveGatewayUrl(toStringOrNull(value.image)),
    animationUrl: resolveGatewayUrl(
      toStringOrNull(value.animation_url ?? value.animationUrl),
    ),
    externalUrl: resolveGatewayUrl(
      toStringOrNull(value.external_url ?? value.externalUrl),
    ),
    backgroundColor: toStringOrNull(
      value.background_color ?? value.backgroundColor,
    ),
    attributes: rawAttributes
      .map((attribute) => {
        if (!attribute || typeof attribute !== "object") {
          return null;
        }

        const candidate = attribute as Record<string, unknown>;
        const traitType = toStringOrNull(
          candidate.trait_type ?? candidate.traitType,
        );
        if (!traitType || candidate.value === undefined || candidate.value === null) {
          return null;
        }

        const normalized: TicketAttribute = {
          traitType,
          value: normalizeAttributeValue(candidate.value),
        };

        const displayType = toStringOrNull(
          candidate.display_type ?? candidate.displayType,
        );
        if (displayType) {
          normalized.displayType = displayType;
        }

        return normalized;
      })
      .filter((attribute): attribute is TicketAttribute => attribute !== null),
  };
}

export async function fetchTicketMetadata(
  tokenUri: string,
  fetcher: typeof fetch = fetch,
): Promise<TicketMetadata> {
  const metadataUrl = resolveGatewayUrl(tokenUri);
  if (!metadataUrl) {
    throw new Error("Ticket metadata URI is unavailable.");
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, METADATA_TIMEOUT_MS);

  try {
    const response = await fetcher(metadataUrl, {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Metadata request failed (${response.status}).`);
    }

    const payload = (await response.json()) as unknown;
    return parseTicketMetadata(payload, tokenUri);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function buildTicketMedia(
  metadata: TicketMetadata | null,
  fallbackLabel: string,
): TicketMediaAsset {
  if (metadata?.animationUrl) {
    return {
      kind: "animation",
      src: metadata.animationUrl,
      posterSrc: metadata.image,
      alt: metadata.name ?? fallbackLabel,
    };
  }

  if (metadata?.image) {
    return {
      kind: "image",
      src: metadata.image,
      posterSrc: metadata.image,
      alt: metadata.name ?? fallbackLabel,
    };
  }

  return {
    kind: "fallback",
    src: null,
    posterSrc: null,
    alt: fallbackLabel,
  };
}

export function buildTicketQrValue(args: {
  tokenId: bigint;
  ticketEventId?: string;
  collectible?: boolean;
}): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost";
  const url = new URL(`/app/tickets/${args.tokenId.toString()}`, origin);

  if (args.ticketEventId) {
    url.searchParams.set("eventId", args.ticketEventId);
  }
  if (args.collectible) {
    url.searchParams.set("view", "collectible");
  }

  return url.toString();
}

export function buildTicketPreviewState(args: {
  tokenId: bigint;
  ticketEventId?: string;
  liveTokenUri?: string | null;
  collectibleTokenUri?: string | null;
  activeTokenUri: string;
  activeView: "live" | "collectible";
  liveMetadata: TicketMetadata | null;
  collectibleMetadata: TicketMetadata | null;
  isLoading: boolean;
  errorMessage: string | null;
}): TicketPreviewState {
  const currentLabel = `Ticket #${args.tokenId.toString()}`;
  const collectibleTokenUri = args.collectibleTokenUri ?? null;
  const liveTokenUri = args.liveTokenUri ?? null;
  const activeMetadata =
    args.activeView === "collectible"
      ? args.collectibleMetadata
      : args.liveMetadata;

  return {
    liveTokenUri,
    collectibleTokenUri,
    activeTokenUri: args.activeTokenUri,
    liveMetadata: args.liveMetadata,
    collectibleMetadata: args.collectibleMetadata,
    activeMetadata,
    liveMedia: liveTokenUri
      ? buildTicketMedia(args.liveMetadata, currentLabel)
      : null,
    collectibleMedia: collectibleTokenUri
      ? buildTicketMedia(
          args.collectibleMetadata,
          `Collectible #${args.tokenId.toString()}`,
        )
      : null,
    activeMedia:
      args.activeView === "collectible"
        ? buildTicketMedia(
            args.collectibleMetadata,
            `Collectible #${args.tokenId.toString()}`,
          )
        : buildTicketMedia(args.liveMetadata, currentLabel),
    activeView: args.activeView,
    liveQrValue: liveTokenUri
      ? buildTicketQrValue({
          tokenId: args.tokenId,
          ticketEventId: args.ticketEventId,
        })
      : null,
    collectibleQrValue: collectibleTokenUri
      ? buildTicketQrValue({
          tokenId: args.tokenId,
          ticketEventId: args.ticketEventId,
          collectible: true,
        })
      : null,
    isLoading: args.isLoading,
    errorMessage: args.errorMessage,
  };
}
