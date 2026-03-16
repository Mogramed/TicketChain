import { formatPol } from "./format";
import type { Locale } from "../i18n/messages";
import type {
  EventDeployment,
  EventDetailTabKey,
  MarketStats,
  SystemState,
  TicketView,
  WorkspaceKey,
} from "../types/chainticket";

export interface EventTrustPoint {
  title: string;
  body: string;
}

export interface EventDetailTabContent {
  key: EventDetailTabKey;
  label: string;
  title: string;
  lead: string;
  bullets: string[];
}

export interface WorkspacePresentation {
  label: string;
  eyebrow: string;
  summary: string;
}

function localeText<T>(locale: Locale, text: { en: T; fr: T }): T {
  return locale === "fr" ? text.fr : text.en;
}

export function getWorkspacePresentation(
  locale: Locale,
): Record<WorkspaceKey, WorkspacePresentation> {
  return {
    explore: {
      label: "Explore",
      eyebrow: localeText(locale, {
        en: "Fan-first discovery",
        fr: "Decouverte fan-first",
      }),
      summary: localeText(locale, {
        en: "Discover headline shows, understand why ChainTicket feels safer, and move quickly into the event page that converts.",
        fr: "Decouvrez les temps forts, comprenez pourquoi ChainTicket rassure, puis entrez vite dans la page evenement qui convertit.",
      }),
    },
    marketplace: {
      label: "Marketplace",
      eyebrow: localeText(locale, {
        en: "Official resale",
        fr: "Resale officiel",
      }),
      summary: localeText(locale, {
        en: "Read the secondary market cleanly, compare fair pricing instantly, and act only when the resale surface feels healthy.",
        fr: "Lisez le marche secondaire proprement, comparez les prix justes en un coup d'oeil, puis agissez seulement quand la revente semble saine.",
      }),
    },
    tickets: {
      label: "My Tickets",
      eyebrow: localeText(locale, {
        en: "Ticket Vault",
        fr: "Ticket Vault",
      }),
      summary: localeText(locale, {
        en: "Treat every pass like a premium digital credential with clear status, proof, perks, and collectible upside.",
        fr: "Traitez chaque pass comme un credential premium avec statut lisible, preuve claire, perks utiles et potentiel collectible.",
      }),
    },
    organizer: {
      label: "Organizer",
      eyebrow: localeText(locale, {
        en: "Operations workspace",
        fr: "Operations",
      }),
      summary: localeText(locale, {
        en: "Run scanning, monitoring, governance, and resale analytics in a dedicated pro surface.",
        fr: "Pilotez le scan, le monitoring, la gouvernance et les analytics de revente dans une surface ops dediee.",
      }),
    },
  };
}

export function getEventBenefitBadges(locale: Locale): string[] {
  return locale === "fr"
    ? ["Fan-first", "Revente plafonnee", "Anti-bot", "Collectible apres show"]
    : ["Fan-first", "Resale capped", "Anti-bot", "Collectible after event"];
}

export function getEventTrustPoints(locale: Locale): EventTrustPoint[] {
  return locale === "fr"
    ? [
        {
          title: "Revente gardee sous controle",
          body: "Le secondaire reste borne par le prix primaire pour garder une sensation d'acces juste au lieu d'un marche trop agressif.",
        },
        {
          title: "Propriete simple a verifier",
          body: "Le billet appartient au wallet qui le detient, ce qui rend la verification plus claire pour le fan comme pour l'organisateur.",
        },
        {
          title: "Fraude plus difficile",
          body: "Le check-in, la revente et l'etat d'usage suivent des regles visibles au lieu de reposer sur un PDF facile a dupliquer.",
        },
        {
          title: "Le souvenir gagne en valeur",
          body: "Apres le show, le meme billet peut reveler sa couche collectible sans perturber l'experience d'entree.",
        },
      ]
    : [
        {
          title: "Resale stays under control",
          body: "Secondary pricing is bounded by the primary price so the market feels fair instead of extractive.",
        },
        {
          title: "Ownership is easy to verify",
          body: "The pass belongs to the wallet holding it, which makes verification clearer for fans and organizers.",
        },
        {
          title: "Fraud is harder to pull off",
          body: "Check-in, resale, and usage state all follow visible rules instead of relying on an easy-to-copy PDF.",
        },
        {
          title: "The souvenir gets better later",
          body: "After the show, the same pass can reveal collectible value without breaking the entry experience.",
        },
      ];
}

export function getEventDetailTabs(args: {
  locale: Locale;
  event: EventDeployment;
  systemState: SystemState | null;
  marketStats: MarketStats | null;
}): EventDetailTabContent[] {
  const { locale, event, systemState, marketStats } = args;
  const primaryPrice = event.primaryPriceWei ? `${formatPol(BigInt(event.primaryPriceWei))} POL` : "-";
  const floorPrice =
    marketStats?.floorPrice !== null && marketStats?.floorPrice !== undefined
      ? `${formatPol(marketStats.floorPrice)} POL`
      : locale === "fr"
        ? "Pas encore de floor"
        : "No floor yet";
  const medianPrice =
    marketStats?.medianPrice !== null && marketStats?.medianPrice !== undefined
      ? `${formatPol(marketStats.medianPrice)} POL`
      : locale === "fr"
        ? "Pas encore de mediane"
        : "No median yet";
  const maxPerWallet =
    systemState?.maxPerWallet !== null && systemState?.maxPerWallet !== undefined
      ? systemState.maxPerWallet.toString()
      : "-";

  if (locale === "fr") {
    return [
      {
        key: "overview",
        label: "Vue d'ensemble",
        title: "Pourquoi cette page convertit mieux",
        lead: "Le detail evenement raconte la promesse ChainTicket comme un benefice simple: acheter vite, revendre proprement et garder un souvenir premium.",
        bullets: [
          `Prix primaire clair: ${primaryPrice}.`,
          "Date, lieu, prix et promesse produit visibles sans jargon.",
          "Narration collectible discrete, sans ton web3 envahissant au moment de l'achat.",
        ],
      },
      {
        key: "rules",
        label: "Regles billet",
        title: "Des regles lisibles sans surprise",
        lead: "Les garde-fous restent visibles en langage produit pour rassurer sans charger l'ecran.",
        bullets: [
          `Cap wallet visible: ${maxPerWallet} billet(s) maximum par wallet.`,
          "Un billet deja utilise ne redevient pas un pass d'entree actif.",
          "Les changements sensibles restent proteges cote organizer.",
        ],
      },
      {
        key: "resale",
        label: "Revente",
        title: "Une revente plus lisible",
        lead: "Le marche secondaire est presente comme une extension propre du produit, pas comme une zone grise.",
        bullets: [
          `Prix primaire de reference: ${primaryPrice}.`,
          `Floor observe: ${floorPrice}.`,
          `Mediane observee: ${medianPrice}.`,
        ],
      },
      {
        key: "perks",
        label: "Perks",
        title: "Ce que le pass continue d'offrir",
        lead: "Le billet n'est pas seulement un droit d'entree: c'est aussi une preuve, un objet collectible et un support de perks.",
        bullets: [
          "Reveal collectible apres l'evenement.",
          "Historique du pass consultable depuis le detail billet.",
          "Perks et attributs exposes dans un format plus premium qu'une simple liste brute.",
        ],
      },
      {
        key: "proof",
        label: "Preuve",
        title: "Une preuve lisible",
        lead: "La blockchain reste en coulisse, mais ses effets restent visibles: propriete, integrite du billet et traces de vie.",
        bullets: [
          "Propriete verifiable depuis le wallet qui detient le billet.",
          "Timeline du billet disponible dans le vault pour les cas ou l'utilisateur veut creuser.",
          "Controles d'usage et d'etat relies a l'entree et a la revente.",
        ],
      },
    ];
  }

  return [
    {
      key: "overview",
      label: "Overview",
      title: "Why this page converts better",
      lead: "The event detail page tells the ChainTicket promise as a simple benefit: buy fast, resell cleanly, and keep a premium souvenir.",
      bullets: [
        `Clear primary price: ${primaryPrice}.`,
        "Date, venue, price, and product promise stay visible without jargon.",
        "Collectible storytelling stays discreet instead of sounding like web3 jargon.",
      ],
    },
    {
      key: "rules",
      label: "Ticket rules",
      title: "Rules without surprises",
      lead: "The guardrails stay visible in plain product language so trust increases without adding friction.",
      bullets: [
        `Visible wallet cap: ${maxPerWallet} ticket(s) per wallet.`,
        "A used pass does not come back as an active entry credential.",
        "Critical changes still flow through organizer protections.",
      ],
    },
    {
      key: "resale",
      label: "Resale",
      title: "Resale that reads cleanly",
      lead: "The secondary market is framed as a controlled extension of the product, not a gray zone.",
      bullets: [
        `Primary reference price: ${primaryPrice}.`,
        `Observed floor: ${floorPrice}.`,
        `Observed median: ${medianPrice}.`,
      ],
    },
    {
      key: "perks",
      label: "Perks",
      title: "What the pass keeps offering",
      lead: "The pass is not only an entry right. It is also proof, a collectible object, and a home for perks.",
      bullets: [
        "Collectible reveal after the event.",
        "Lifecycle snapshot available from the pass detail view.",
        "Perks and attributes presented in a premium format instead of a raw metadata dump.",
      ],
    },
    {
      key: "proof",
      label: "Proof",
      title: "Proof people can understand",
      lead: "Blockchain stays backstage, but its effects remain visible: ownership, ticket integrity, and lifecycle evidence.",
      bullets: [
        "Ownership can be verified from the wallet holding the pass.",
        "Timeline remains available in the vault when someone wants the deeper evidence layer.",
        "Usage and market controls stay tied to entry and resale behavior.",
      ],
    },
  ];
}

export function getTicketPerks(locale: Locale): string[] {
  return locale === "fr"
    ? ["Entree rapide", "Garde-fous revente", "Reveal collectible"]
    : ["Fast entry", "Resale guardrails", "Collectible reveal"];
}

export function getTicketStateLabel(args: {
  locale: Locale;
  ticket: TicketView;
  collectibleMode: boolean;
  collectibleReady: boolean;
}): string {
  const { locale, ticket, collectibleMode, collectibleReady } = args;
  if (ticket.used && (collectibleMode || collectibleReady)) {
    return locale === "fr" ? "Collectible" : "Collectible";
  }
  if (ticket.used) {
    return locale === "fr" ? "Utilise" : "Used";
  }
  if (ticket.listed) {
    return locale === "fr" ? "En revente" : "Listed";
  }
  return locale === "fr" ? "Detenu" : "Owned";
}
