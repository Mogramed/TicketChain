import type { DemoEventCandidate, DemoSelectionBucket } from "./demoCatalog.js";

interface TicketmasterImage {
  url?: string;
  width?: number;
  height?: number;
  ratio?: string;
  fallback?: boolean;
}

interface TicketmasterClassificationNode {
  name?: string;
}

interface TicketmasterClassification {
  segment?: TicketmasterClassificationNode;
  genre?: TicketmasterClassificationNode;
  subGenre?: TicketmasterClassificationNode;
  type?: TicketmasterClassificationNode;
  subType?: TicketmasterClassificationNode;
}

interface TicketmasterVenue {
  name?: string;
  city?: {
    name?: string;
  };
  country?: {
    countryCode?: string;
  };
}

interface TicketmasterEvent {
  id?: string;
  name?: string;
  url?: string;
  dates?: {
    start?: {
      dateTime?: string;
      localDate?: string;
    };
  };
  images?: TicketmasterImage[];
  classifications?: TicketmasterClassification[];
  _embedded?: {
    venues?: TicketmasterVenue[];
  };
}

interface TicketmasterSearchResponse {
  _embedded?: {
    events?: TicketmasterEvent[];
  };
  page?: {
    number?: number;
    totalPages?: number;
    size?: number;
    totalElements?: number;
  };
}

function toIsoTimestamp(input: number): string {
  return new Date(input).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function pickImage(images: TicketmasterImage[] | undefined): string | null {
  if (!images || images.length === 0) {
    return null;
  }

  const ranked = [...images].sort((left, right) => {
    const leftRatioScore = left.ratio === "16_9" ? 0 : left.ratio === "3_2" ? 1 : 2;
    const rightRatioScore = right.ratio === "16_9" ? 0 : right.ratio === "3_2" ? 1 : 2;
    if (leftRatioScore !== rightRatioScore) {
      return leftRatioScore - rightRatioScore;
    }

    const leftArea = (left.width ?? 0) * (left.height ?? 0);
    const rightArea = (right.width ?? 0) * (right.height ?? 0);
    return rightArea - leftArea;
  });

  return ranked[0]?.url ?? null;
}

function parseStartsAt(event: TicketmasterEvent): number | null {
  const start = event.dates?.start;
  if (start?.dateTime) {
    const parsed = Date.parse(start.dateTime);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (start?.localDate) {
    const parsed = Date.parse(`${start.localDate}T00:00:00Z`);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstClassificationName(
  classification: TicketmasterClassification | undefined,
  ...keys: Array<keyof TicketmasterClassification>
): string | null {
  for (const key of keys) {
    const value = classification?.[key]?.name?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function classifySelectionBucket(classifications: TicketmasterClassification[] | undefined): {
  selectionBucket: DemoSelectionBucket;
  category: string | null;
} {
  const classification = classifications?.[0];
  const segment = firstClassificationName(classification, "segment");
  const genre = firstClassificationName(classification, "genre");
  const subGenre = firstClassificationName(classification, "subGenre");
  const haystack = [segment, genre, subGenre]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  if (haystack.includes("comedy")) {
    return {
      selectionBucket: "comedy",
      category: subGenre ?? genre ?? segment ?? "Comedy",
    };
  }

  if (
    haystack.includes("arts") ||
    haystack.includes("theatre") ||
    haystack.includes("theater") ||
    haystack.includes("broadway") ||
    haystack.includes("play")
  ) {
    return {
      selectionBucket: "arts",
      category: subGenre ?? genre ?? segment ?? "Arts & Theatre",
    };
  }

  if (haystack.includes("music") || haystack.includes("rock") || haystack.includes("pop")) {
    return {
      selectionBucket: "music",
      category: subGenre ?? genre ?? segment ?? "Music",
    };
  }

  return {
    selectionBucket: "flex",
    category: subGenre ?? genre ?? segment ?? null,
  };
}

export function normalizeTicketmasterEvent(
  event: TicketmasterEvent,
  fallbackCountryCode: string,
): DemoEventCandidate | null {
  const sourceEventId = event.id?.trim();
  const name = event.name?.trim();
  if (!sourceEventId || !name) {
    return null;
  }

  const startsAt = parseStartsAt(event);
  const venue = event._embedded?.venues?.[0];
  const countryCode = venue?.country?.countryCode?.trim() || fallbackCountryCode;
  const { selectionBucket, category } = classifySelectionBucket(event.classifications);

  return {
    source: "ticketmaster",
    sourceEventId,
    name,
    startsAt,
    venueName: venue?.name?.trim() || null,
    city: venue?.city?.name?.trim() || null,
    countryCode,
    imageUrl: pickImage(event.images),
    category,
    sourceUrl: event.url?.trim() || null,
    selectionBucket,
  };
}

async function fetchCountryEvents(options: {
  apiKey: string;
  baseUrl: string;
  countryCode: string;
  now: number;
  windowDays: number;
  pageSize: number;
  maxPages: number;
  fetchImpl?: typeof fetch;
}): Promise<DemoEventCandidate[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const candidates: DemoEventCandidate[] = [];
  const startDateTime = toIsoTimestamp(options.now);
  const endDateTime = toIsoTimestamp(
    options.now + options.windowDays * 24 * 60 * 60 * 1000,
  );

  for (let page = 0; page < options.maxPages; page += 1) {
    const query = new URLSearchParams({
      apikey: options.apiKey,
      countryCode: options.countryCode,
      sort: "date,asc",
      size: String(options.pageSize),
      page: String(page),
      startDateTime,
      endDateTime,
    });

    const response = await fetchImpl(
      `${options.baseUrl.replace(/\/$/, "")}/discovery/v2/events.json?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Ticketmaster request failed for ${options.countryCode} (status ${response.status}).`,
      );
    }

    const payload = (await response.json()) as TicketmasterSearchResponse;
    const events = payload._embedded?.events ?? [];

    for (const event of events) {
      const normalized = normalizeTicketmasterEvent(event, options.countryCode);
      if (normalized) {
        candidates.push(normalized);
      }
    }

    const totalPages = payload.page?.totalPages ?? page + 1;
    if (page + 1 >= totalPages || events.length === 0) {
      break;
    }
  }

  return candidates;
}

export async function fetchTicketmasterCandidates(options: {
  apiKey: string;
  baseUrl?: string;
  now?: number;
  windowDays?: number;
  pageSize?: number;
  maxPages?: number;
  fetchImpl?: typeof fetch;
}): Promise<DemoEventCandidate[]> {
  if (!options.apiKey.trim()) {
    throw new Error("Ticketmaster API key is required to refresh the demo lineup.");
  }

  const now = options.now ?? Date.now();
  const windowDays = options.windowDays ?? 180;
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 2;
  const baseUrl = options.baseUrl ?? "https://app.ticketmaster.com";

  const [frCandidates, gbCandidates] = await Promise.all([
    fetchCountryEvents({
      apiKey: options.apiKey,
      baseUrl,
      countryCode: "FR",
      now,
      windowDays,
      pageSize,
      maxPages,
      fetchImpl: options.fetchImpl,
    }),
    fetchCountryEvents({
      apiKey: options.apiKey,
      baseUrl,
      countryCode: "GB",
      now,
      windowDays,
      pageSize,
      maxPages,
      fetchImpl: options.fetchImpl,
    }),
  ]);

  return [...frCandidates, ...gbCandidates];
}
