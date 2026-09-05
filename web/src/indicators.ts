export type LinkStatus = "official_match" | "claimed_org_mismatch" | "unverified";

export interface LinkIndicator {
  displayed_url: string;
  hostname: string;
  status: LinkStatus;
  organisation: string | null;
  reason: string;
}

export interface IndicatorReport {
  claimed_organisations: string[];
  links: LinkIndicator[];
  masked_phone_numbers: string[];
}

interface OfficialOrganisation {
  id: string;
  name: string;
  aliases: string[];
  domains: string[];
  source_url: string;
}

/**
 * Curated from the organisations' own websites on 2026-09-05.
 * Matching is hostname-only and never causes a request to the submitted URL.
 */
export const OFFICIAL_DOMAIN_ALLOWLIST: OfficialOrganisation[] = [
  {
    id: "ocbc",
    name: "OCBC",
    aliases: ["ocbc"],
    domains: ["ocbc.com"],
    source_url: "https://www.ocbc.com/personal-banking/home.page",
  },
  {
    id: "dbs",
    name: "DBS",
    aliases: ["dbs"],
    domains: ["dbs.com.sg"],
    source_url: "https://www.dbs.com.sg/personal/default.page",
  },
  {
    id: "posb",
    name: "POSB",
    aliases: ["posb"],
    domains: ["posb.com.sg"],
    source_url: "https://www.posb.com.sg/personal/default.page",
  },
  {
    id: "uob",
    name: "UOB",
    aliases: ["uob", "united overseas bank"],
    domains: ["uob.com.sg", "uob.sg"],
    source_url: "https://www.uob.com.sg/personal/index.page",
  },
  {
    id: "scamshield",
    name: "ScamShield",
    aliases: ["scamshield"],
    domains: ["scamshield.gov.sg"],
    source_url: "https://www.scamshield.gov.sg/",
  },
  {
    id: "spf",
    name: "Singapore Police Force",
    aliases: ["singapore police force", "spf", "police"],
    domains: ["police.gov.sg"],
    source_url: "https://www.police.gov.sg/",
  },
  {
    id: "singapore-government",
    name: "Singapore Government",
    aliases: ["government", "ministry", "agency"],
    domains: ["gov.sg"],
    source_url: "https://www.gov.sg/",
  },
];

const URL_PATTERN =
  /\b(?:(?:https?:\/\/|www\.)[^\s<>\[\]{}"']+|(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\.)+(?:com|sg|net|org|co|io|app|info|online|site|top|xyz|ly|gl)(?:\/[^\s<>\[\]{}"']*)?)/gi;
const PHONE_PATTERN = /(?<!\d)(?:(?:\+?65)[ -]?)?(?:1800[ -]?\d{3}[ -]?\d{4}|[689]\d{3}[ -]?\d{4})(?!\d)/g;
const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl"]);

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[),.;:!?]+$/g, "");
}

function hostnameMatches(hostname: string, officialDomain: string): boolean {
  return hostname === officialDomain || hostname.endsWith(`.${officialDomain}`);
}

function claimedOrganisations(text: string): OfficialOrganisation[] {
  const lower = text.toLowerCase();
  return OFFICIAL_DOMAIN_ALLOWLIST.filter((organisation) =>
    organisation.aliases.some((alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`\\b${escaped}\\b`, "i").test(lower);
    }),
  );
}

function parseLink(raw: string, claims: OfficialOrganisation[]): LinkIndicator | null {
  const displayedUrl = stripTrailingPunctuation(raw);
  try {
    const parsed = new URL(/^https?:\/\//i.test(displayedUrl) ? displayedUrl : `https://${displayedUrl}`);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (!hostname || (!hostname.includes(".") && hostname !== "localhost")) return null;

    const official = OFFICIAL_DOMAIN_ALLOWLIST.find((organisation) =>
      organisation.domains.some((domain) => hostnameMatches(hostname, domain)),
    );
    if (official) {
      const claimMismatch = claims.length > 0 && !claims.some((claim) => claim.id === official.id) && official.id !== "singapore-government";
      return {
        displayed_url: displayedUrl,
        hostname,
        status: claimMismatch ? "claimed_org_mismatch" : "official_match",
        organisation: official.name,
        reason: claimMismatch
          ? `This is an allow-listed ${official.name} domain, but it does not match the organisation claimed in the message.`
          : `The hostname matches the ${official.name} allow-list. This does not verify the page content.`,
      };
    }

    const lookalike = OFFICIAL_DOMAIN_ALLOWLIST.find((organisation) =>
      organisation.aliases.some((alias) => hostname.includes(alias.replaceAll(" ", ""))),
    );
    if (claims.length || lookalike) {
      const names = unique((lookalike ? [lookalike] : claims).map((claim) => claim.name));
      return {
        displayed_url: displayedUrl,
        hostname,
        status: "claimed_org_mismatch",
        organisation: names.join(", "),
        reason: `The hostname does not match the allow-listed domain for ${names.join(" or ")}.`,
      };
    }

    return {
      displayed_url: displayedUrl,
      hostname,
      status: "unverified",
      organisation: null,
      reason: SHORTENERS.has(hostname)
        ? "This shortened link hides its final destination."
        : "This domain is not in ScamSafe's official allow-list.",
    };
  } catch {
    return null;
  }
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `•••• ${digits.slice(-4)}`;
}

export function inspectIndicators(text: string): IndicatorReport {
  const claims = claimedOrganisations(text);
  const rawLinks = unique(text.match(URL_PATTERN)?.map(stripTrailingPunctuation) ?? []);
  const links = rawLinks
    .map((raw) => parseLink(raw, claims))
    .filter((link): link is LinkIndicator => Boolean(link));
  const withoutLinks = rawLinks.reduce((remaining, link) => remaining.replaceAll(link, " "), text);
  const maskedPhoneNumbers = unique((withoutLinks.match(PHONE_PATTERN) ?? []).map(maskPhone));

  return {
    claimed_organisations: claims.map((claim) => claim.name),
    links,
    masked_phone_numbers: maskedPhoneNumbers,
  };
}
