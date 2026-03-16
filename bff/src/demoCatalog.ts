import type { DemoCatalogEntry, TicketEventDeployment } from "./types.js";

export const DEMO_PASS_DISCLAIMER = "Demo pass only - not official venue admission";

export type DemoSelectionBucket = "music" | "arts" | "comedy" | "flex";

export interface DemoEventCandidate {
  source: "ticketmaster";
  sourceEventId: string;
  name: string;
  startsAt: number | null;
  venueName: string | null;
  city: string | null;
  countryCode: string | null;
  imageUrl: string | null;
  category: string | null;
  sourceUrl: string | null;
  selectionBucket: DemoSelectionBucket;
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(16).padStart(8, "0");
}

function startsAtKey(startsAt: number | null): string {
  if (startsAt === null) {
    return "date-unknown";
  }
  return new Date(startsAt).toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildDemoEventId(candidate: DemoEventCandidate): string {
  const countryPrefix = (candidate.countryCode ?? "xx").toLowerCase();
  const nameSlug = slugify(candidate.name).slice(0, 28) || "live-event";
  const hash = hashString(`${candidate.source}:${candidate.sourceEventId}`).slice(0, 6);
  return `demo-${countryPrefix}-${nameSlug}-${startsAtKey(candidate.startsAt)}-${hash}`;
}

function compareCandidates(left: DemoEventCandidate, right: DemoEventCandidate): number {
  const leftCountry = left.countryCode === "FR" ? 0 : left.countryCode === "GB" ? 1 : 2;
  const rightCountry = right.countryCode === "FR" ? 0 : right.countryCode === "GB" ? 1 : 2;
  if (leftCountry !== rightCountry) {
    return leftCountry - rightCountry;
  }

  const leftStartsAt = left.startsAt ?? Number.MAX_SAFE_INTEGER;
  const rightStartsAt = right.startsAt ?? Number.MAX_SAFE_INTEGER;
  if (leftStartsAt !== rightStartsAt) {
    return leftStartsAt - rightStartsAt;
  }

  return left.name.localeCompare(right.name);
}

function uniqueCandidates(candidates: DemoEventCandidate[]): DemoEventCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.sourceEventId)) {
      return false;
    }
    seen.add(candidate.sourceEventId);
    return true;
  });
}

export function selectDemoLineup(
  candidates: DemoEventCandidate[],
  options: {
    fetchedAt: number;
    expiresAt: number;
  },
): DemoCatalogEntry[] {
  const sorted = uniqueCandidates(candidates).sort(compareCandidates);
  const selectedIds = new Set<string>();
  const selected: DemoEventCandidate[] = [];

  const pickNext = (bucket?: DemoSelectionBucket) => {
    const next = sorted.find((candidate) => {
      if (selectedIds.has(candidate.sourceEventId)) {
        return false;
      }
      return bucket ? candidate.selectionBucket === bucket : true;
    });

    if (!next) {
      return;
    }

    selected.push(next);
    selectedIds.add(next.sourceEventId);
  };

  pickNext("music");
  pickNext("music");
  pickNext("arts");
  pickNext("comedy");
  pickNext();

  while (selected.length < 5) {
    const countBeforePick = selected.length;
    pickNext();
    if (selected.length === countBeforePick) {
      break;
    }
  }

  if (selected.length < 5) {
    throw new Error(
      `Unable to build a 5-event demo lineup from the available Ticketmaster candidates. Found ${selected.length} usable events.`,
    );
  }

  return selected.slice(0, 5).map((candidate, index) => ({
    lineupStatus: "staged",
    slotIndex: index,
    ticketEventId: buildDemoEventId(candidate),
    source: candidate.source,
    sourceEventId: candidate.sourceEventId,
    name: candidate.name,
    startsAt: candidate.startsAt,
    venueName: candidate.venueName,
    city: candidate.city,
    countryCode: candidate.countryCode,
    imageUrl: candidate.imageUrl,
    category: candidate.category,
    sourceUrl: candidate.sourceUrl,
    fetchedAt: options.fetchedAt,
    expiresAt: options.expiresAt,
    demoDisclaimer: DEMO_PASS_DISCLAIMER,
  }));
}

export function mergeDemoCatalogEntries(
  deployments: TicketEventDeployment[],
  demoEntries: DemoCatalogEntry[],
): TicketEventDeployment[] {
  if (demoEntries.length === 0) {
    return deployments;
  }

  const deploymentById = new Map(
    deployments.map((deployment) => [deployment.ticketEventId, deployment] as const),
  );
  const merged: TicketEventDeployment[] = [];

  for (const entry of demoEntries) {
    const deployment = deploymentById.get(entry.ticketEventId);
    if (!deployment) {
      continue;
    }

    merged.push({
      ...deployment,
      isDemoInspired: true,
      demoDisclaimer: entry.demoDisclaimer,
      source: entry.source,
      sourceEventId: entry.sourceEventId,
      sourceUrl: entry.sourceUrl,
      startsAt: entry.startsAt,
      venueName: entry.venueName,
      city: entry.city,
      countryCode: entry.countryCode,
      imageUrl: entry.imageUrl,
      category: entry.category,
    });
  }

  return merged;
}
