import type { TicketEventDeployment } from "./types.js";

export type DemoAssetVariant = "live" | "collectible";

interface DemoAssetTheme {
  backgroundStart: string;
  backgroundEnd: string;
  panelFill: string;
  accent: string;
  accentSoft: string;
  textPrimary: string;
  textSecondary: string;
  stroke: string;
}

const LIVE_THEMES: Record<string, DemoAssetTheme> = {
  music: {
    backgroundStart: "#0F172A",
    backgroundEnd: "#1D4ED8",
    panelFill: "#0B1220",
    accent: "#F59E0B",
    accentSoft: "#FDE68A",
    textPrimary: "#F8FAFC",
    textSecondary: "#CBD5E1",
    stroke: "#334155",
  },
  comedy: {
    backgroundStart: "#172554",
    backgroundEnd: "#2563EB",
    panelFill: "#111827",
    accent: "#FB7185",
    accentSoft: "#FBCFE8",
    textPrimary: "#F8FAFC",
    textSecondary: "#DBEAFE",
    stroke: "#475569",
  },
  theatre: {
    backgroundStart: "#431407",
    backgroundEnd: "#9A3412",
    panelFill: "#2A1108",
    accent: "#F97316",
    accentSoft: "#FED7AA",
    textPrimary: "#FFF7ED",
    textSecondary: "#FDBA74",
    stroke: "#7C2D12",
  },
  default: {
    backgroundStart: "#111827",
    backgroundEnd: "#1F2937",
    panelFill: "#0F172A",
    accent: "#22C55E",
    accentSoft: "#BBF7D0",
    textPrimary: "#F9FAFB",
    textSecondary: "#D1D5DB",
    stroke: "#374151",
  },
};

const COLLECTIBLE_THEMES: Record<string, DemoAssetTheme> = {
  music: {
    backgroundStart: "#3B0764",
    backgroundEnd: "#7C3AED",
    panelFill: "#1E1B4B",
    accent: "#F472B6",
    accentSoft: "#F5D0FE",
    textPrimary: "#FDF4FF",
    textSecondary: "#E9D5FF",
    stroke: "#6D28D9",
  },
  comedy: {
    backgroundStart: "#052E16",
    backgroundEnd: "#15803D",
    panelFill: "#0F2B1D",
    accent: "#FACC15",
    accentSoft: "#FEF08A",
    textPrimary: "#F0FDF4",
    textSecondary: "#D9F99D",
    stroke: "#166534",
  },
  theatre: {
    backgroundStart: "#4A044E",
    backgroundEnd: "#A21CAF",
    panelFill: "#3B0764",
    accent: "#FB7185",
    accentSoft: "#FBCFE8",
    textPrimary: "#FDF2F8",
    textSecondary: "#F5D0FE",
    stroke: "#86198F",
  },
  default: {
    backgroundStart: "#1E293B",
    backgroundEnd: "#0F766E",
    panelFill: "#0F172A",
    accent: "#2DD4BF",
    accentSoft: "#99F6E4",
    textPrimary: "#F8FAFC",
    textSecondary: "#CCFBF1",
    stroke: "#155E75",
  },
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getCategoryFamily(event: TicketEventDeployment): keyof typeof LIVE_THEMES {
  const normalized = (event.category ?? "").trim().toLowerCase();
  if (
    normalized.includes("comedy") ||
    normalized.includes("stand-up") ||
    normalized.includes("humour")
  ) {
    return "comedy";
  }
  if (
    normalized.includes("theatre") ||
    normalized.includes("theater") ||
    normalized.includes("arts")
  ) {
    return "theatre";
  }
  if (
    normalized.includes("music") ||
    normalized.includes("rock") ||
    normalized.includes("pop") ||
    normalized.includes("rap") ||
    normalized.includes("r&b")
  ) {
    return "music";
  }

  return "default";
}

function getTheme(
  event: TicketEventDeployment,
  variant: DemoAssetVariant,
): DemoAssetTheme {
  const family = getCategoryFamily(event);
  return variant === "collectible"
    ? COLLECTIBLE_THEMES[family]
    : LIVE_THEMES[family];
}

function formatEventDate(startsAt: number | null | undefined): string {
  if (!startsAt) {
    return "Date to be announced";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(startsAt));
}

function buildSeatLabel(tokenId: bigint): string {
  const row = String.fromCharCode(65 + Number(tokenId % 26n));
  const seat = Number((tokenId * 7n) % 28n) + 1;
  return `${row}-${seat.toString().padStart(2, "0")}`;
}

function buildSectionLabel(tokenId: bigint): string {
  const sections = ["Floor", "Lower Bowl", "Mezzanine", "Balcony"];
  return sections[Number(tokenId % BigInt(sections.length))] ?? "Floor";
}

function buildEditionLabel(variant: DemoAssetVariant): string {
  return variant === "collectible" ? "Collectible Edition" : "Mobile Entry Pass";
}

function buildExperienceLabel(variant: DemoAssetVariant): string {
  return variant === "collectible" ? "Post-event collectible" : "Live event admission";
}

function normalizeOrigin(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

export function isDemoAssetVariant(value: string): value is DemoAssetVariant {
  return value === "live" || value === "collectible";
}

export function buildDemoAssetBaseUrl(
  origin: string,
  ticketEventId: string,
  variant: DemoAssetVariant,
): string {
  return `${normalizeOrigin(origin)}/demo-assets/${ticketEventId}/${variant}/`;
}

function buildMetadataDescription(
  event: TicketEventDeployment,
  tokenId: bigint,
  variant: DemoAssetVariant,
): string {
  const parts = [
    buildExperienceLabel(variant),
    `${event.name} in ${event.city ?? "the selected city"}`,
    formatEventDate(event.startsAt),
    event.demoDisclaimer ?? "Demo pass only - not official venue admission",
    `Token #${tokenId.toString()}`,
  ];

  return parts.join(" | ");
}

export function buildDemoTicketMetadata(args: {
  event: TicketEventDeployment;
  tokenId: bigint;
  variant: DemoAssetVariant;
  origin: string;
}): Record<string, unknown> {
  const { event, tokenId, variant } = args;
  const baseUrl = buildDemoAssetBaseUrl(args.origin, event.ticketEventId, variant);
  const section = buildSectionLabel(tokenId);
  const seat = buildSeatLabel(tokenId);
  const edition = buildEditionLabel(variant);
  const sourceLabel = event.source === "ticketmaster" ? "Ticketmaster public listing" : "Public source";

  return {
    name: `${event.name} ${edition} #${tokenId.toString()}`,
    description: buildMetadataDescription(event, tokenId, variant),
    image: `${baseUrl}${tokenId.toString()}.svg`,
    external_url: event.sourceUrl ?? `${normalizeOrigin(args.origin)}/app/tickets/${tokenId.toString()}?eventId=${event.ticketEventId}`,
    background_color: variant === "collectible" ? "140A22" : "0F172A",
    attributes: [
      { trait_type: "Event", value: event.name },
      { trait_type: "Edition", value: edition },
      { trait_type: "Experience", value: buildExperienceLabel(variant) },
      { trait_type: "Category", value: event.category ?? "Live event" },
      { trait_type: "Venue", value: event.venueName ?? "Venue TBA" },
      { trait_type: "City", value: event.city ?? "City TBA" },
      { trait_type: "Country", value: event.countryCode ?? "TBA" },
      { trait_type: "Date", value: formatEventDate(event.startsAt) },
      { trait_type: "Section", value: section },
      { trait_type: "Seat", value: seat },
      { trait_type: "Token ID", value: tokenId.toString() },
      {
        trait_type: "Admission",
        value: event.demoDisclaimer ?? "Demo pass only - not official venue admission",
      },
      {
        trait_type: "Source",
        value: sourceLabel,
      },
    ],
  };
}

function buildAccentPattern(theme: DemoAssetTheme, variant: DemoAssetVariant): string {
  if (variant === "collectible") {
    return `
      <circle cx="960" cy="300" r="220" fill="${theme.accent}" opacity="0.18" />
      <circle cx="960" cy="300" r="150" fill="${theme.accentSoft}" opacity="0.16" />
      <circle cx="110" cy="1650" r="170" fill="${theme.accent}" opacity="0.15" />
    `;
  }

  return `
    <rect x="920" y="0" width="280" height="1800" fill="${theme.accent}" opacity="0.1" />
    <rect x="0" y="1260" width="1200" height="140" fill="${theme.accent}" opacity="0.08" />
    <circle cx="1040" cy="220" r="140" fill="${theme.accentSoft}" opacity="0.15" />
  `;
}

function buildQrGlyph(theme: DemoAssetTheme): string {
  const cells: Array<[number, number]> = [
    [0, 0], [1, 0], [2, 0], [4, 0], [6, 0],
    [0, 1], [2, 1], [4, 1], [5, 1], [6, 1],
    [0, 2], [1, 2], [2, 2], [3, 2], [6, 2],
    [1, 3], [3, 3], [4, 3], [5, 3],
    [0, 4], [1, 4], [4, 4], [6, 4],
    [0, 5], [2, 5], [3, 5], [5, 5], [6, 5],
    [0, 6], [1, 6], [2, 6], [4, 6], [6, 6],
  ];

  return cells
    .map(([x, y]) => {
      const left = 0 + x * 18;
      const top = 0 + y * 18;
      return `<rect x="${left}" y="${top}" width="14" height="14" rx="3" fill="${theme.textPrimary}" opacity="0.92" />`;
    })
    .join("");
}

export function buildDemoTicketSvg(args: {
  event: TicketEventDeployment;
  tokenId: bigint;
  variant: DemoAssetVariant;
}): string {
  const { event, tokenId, variant } = args;
  const theme = getTheme(event, variant);
  const seat = buildSeatLabel(tokenId);
  const section = buildSectionLabel(tokenId);
  const dateLabel = formatEventDate(event.startsAt);
  const cityLabel = [event.city, event.countryCode].filter(Boolean).join(", ") || "Location TBA";
  const venueLabel = event.venueName ?? "Venue TBA";
  const editionLabel = buildEditionLabel(variant);
  const headingLabel = escapeXml(event.name);
  const disclaimer = escapeXml(
    event.demoDisclaimer ?? "Demo pass only - not official venue admission",
  );
  const category = escapeXml(event.category ?? "Live event");
  const city = escapeXml(cityLabel);
  const venue = escapeXml(venueLabel);
  const date = escapeXml(dateLabel);
  const edition = escapeXml(editionLabel);
  const tokenLabel = tokenId.toString();
  const sectionLabel = escapeXml(section);
  const seatLabel = escapeXml(seat);

  return `
<svg width="1200" height="1800" viewBox="0 0 1200 1800" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${headingLabel} ${edition}">
  <defs>
    <linearGradient id="bg" x1="120" y1="80" x2="1080" y2="1720" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${theme.backgroundStart}" />
      <stop offset="1" stop-color="${theme.backgroundEnd}" />
    </linearGradient>
    <linearGradient id="panel" x1="160" y1="180" x2="1040" y2="1620" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${theme.panelFill}" stop-opacity="0.96" />
      <stop offset="1" stop-color="${theme.panelFill}" stop-opacity="0.82" />
    </linearGradient>
  </defs>

  <rect width="1200" height="1800" rx="44" fill="url(#bg)" />
  ${buildAccentPattern(theme, variant)}
  <rect x="86" y="94" width="1028" height="1612" rx="42" fill="url(#panel)" stroke="${theme.stroke}" stroke-width="2" />

  <rect x="138" y="146" width="924" height="54" rx="18" fill="${theme.accent}" opacity="0.94" />
  <text x="170" y="181" fill="#0B1020" font-family="Georgia, serif" font-size="26" font-weight="700" letter-spacing="2">
    CHAIN TICKET DEMO
  </text>

  <text x="148" y="292" fill="${theme.textSecondary}" font-family="Arial, sans-serif" font-size="22" letter-spacing="3">
    ${edition.toUpperCase()}
  </text>
  <text x="148" y="384" fill="${theme.textPrimary}" font-family="Georgia, serif" font-size="78" font-weight="700">
    ${headingLabel}
  </text>

  <text x="148" y="470" fill="${theme.textSecondary}" font-family="Arial, sans-serif" font-size="28">
    ${date}
  </text>
  <text x="148" y="514" fill="${theme.textSecondary}" font-family="Arial, sans-serif" font-size="28">
    ${venue}
  </text>
  <text x="148" y="558" fill="${theme.textSecondary}" font-family="Arial, sans-serif" font-size="28">
    ${city}
  </text>

  <rect x="148" y="632" width="258" height="140" rx="28" fill="${theme.accent}" opacity="0.16" />
  <text x="180" y="686" fill="${theme.accentSoft}" font-family="Arial, sans-serif" font-size="20" letter-spacing="2">
    CATEGORY
  </text>
  <text x="180" y="736" fill="${theme.textPrimary}" font-family="Arial, sans-serif" font-size="34" font-weight="700">
    ${category}
  </text>

  <rect x="430" y="632" width="258" height="140" rx="28" fill="${theme.accent}" opacity="0.12" />
  <text x="462" y="686" fill="${theme.accentSoft}" font-family="Arial, sans-serif" font-size="20" letter-spacing="2">
    SECTION
  </text>
  <text x="462" y="736" fill="${theme.textPrimary}" font-family="Arial, sans-serif" font-size="34" font-weight="700">
    ${sectionLabel}
  </text>

  <rect x="712" y="632" width="350" height="140" rx="28" fill="${theme.accent}" opacity="0.12" />
  <text x="744" y="686" fill="${theme.accentSoft}" font-family="Arial, sans-serif" font-size="20" letter-spacing="2">
    SEAT
  </text>
  <text x="744" y="736" fill="${theme.textPrimary}" font-family="Arial, sans-serif" font-size="34" font-weight="700">
    ${seatLabel}
  </text>

  <rect x="148" y="840" width="914" height="12" rx="6" fill="${theme.stroke}" opacity="0.55" />

  <rect x="148" y="916" width="452" height="540" rx="34" fill="#FFFFFF" opacity="0.96" />
  <g transform="translate(208 982)">
    ${buildQrGlyph(theme)}
  </g>
  <text x="208" y="1194" fill="#111827" font-family="Arial, sans-serif" font-size="28" font-weight="700">
    TOKEN #${tokenLabel}
  </text>
  <text x="208" y="1240" fill="#334155" font-family="Arial, sans-serif" font-size="24">
    ${variant === "collectible" ? "Collectible route enabled" : "Scanner ready"}
  </text>
  <text x="208" y="1282" fill="#334155" font-family="Arial, sans-serif" font-size="24">
    ${sectionLabel} / ${seatLabel}
  </text>

  <rect x="640" y="916" width="422" height="540" rx="34" fill="${theme.accent}" opacity="0.12" />
  <text x="688" y="996" fill="${theme.accentSoft}" font-family="Arial, sans-serif" font-size="20" letter-spacing="3">
    EXPERIENCE
  </text>
  <text x="688" y="1060" fill="${theme.textPrimary}" font-family="Georgia, serif" font-size="52" font-weight="700">
    ${variant === "collectible" ? "After the show" : "Before the gates"}
  </text>
  <text x="688" y="1132" fill="${theme.textSecondary}" font-family="Arial, sans-serif" font-size="26">
    ${variant === "collectible" ? "Post-event artwork unlock" : "Primary entry validation"}
  </text>
  <text x="688" y="1184" fill="${theme.textSecondary}" font-family="Arial, sans-serif" font-size="26">
    ${event.sourceUrl ? "Inspired by a public event listing" : "Demo showcase pass"}
  </text>
  <text x="688" y="1290" fill="${theme.textPrimary}" font-family="Arial, sans-serif" font-size="28">
    Demo pass only
  </text>
  <text x="688" y="1334" fill="${theme.textSecondary}" font-family="Arial, sans-serif" font-size="24">
    Not official venue admission
  </text>

  <rect x="148" y="1528" width="914" height="112" rx="28" fill="${theme.accent}" opacity="0.12" />
  <text x="188" y="1588" fill="${theme.textPrimary}" font-family="Arial, sans-serif" font-size="24" font-weight="700">
    ${disclaimer}
  </text>
  <text x="188" y="1630" fill="${theme.textSecondary}" font-family="Arial, sans-serif" font-size="22">
    Source inspiration: ${(event.source ?? "public").toUpperCase()} | Event id: ${escapeXml(event.ticketEventId)}
  </text>
</svg>`.trim();
}
