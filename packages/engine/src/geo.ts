/** Metro-area normalization used by constraint evaluation, search filters and the parsers. */
export interface Metro {
  key: string;
  label: string;
  city: string;
  region: string;
  countryCode: string;
  aliases: string[];
}

export const METROS: Metro[] = [
  {
    key: "sf_bay",
    label: "San Francisco Bay Area",
    city: "San Francisco",
    region: "CA",
    countryCode: "US",
    aliases: [
      "san francisco",
      "sf",
      "bay area",
      "sf bay area",
      "oakland",
      "berkeley",
      "palo alto",
      "mountain view",
      "san jose",
      "menlo park",
      "sunnyvale",
      "redwood city",
      "san mateo",
    ],
  },
  {
    key: "nyc",
    label: "New York City",
    city: "New York",
    region: "NY",
    countryCode: "US",
    aliases: ["new york", "nyc", "new york city", "brooklyn", "manhattan", "jersey city"],
  },
  {
    key: "seattle",
    label: "Seattle",
    city: "Seattle",
    region: "WA",
    countryCode: "US",
    aliases: ["seattle", "bellevue", "redmond", "kirkland"],
  },
  { key: "austin", label: "Austin", city: "Austin", region: "TX", countryCode: "US", aliases: ["austin"] },
  {
    key: "boston",
    label: "Boston",
    city: "Boston",
    region: "MA",
    countryCode: "US",
    aliases: ["boston", "cambridge", "somerville"],
  },
  {
    key: "la",
    label: "Los Angeles",
    city: "Los Angeles",
    region: "CA",
    countryCode: "US",
    aliases: ["los angeles", "la", "santa monica", "pasadena"],
  },
  {
    key: "chicago",
    label: "Chicago",
    city: "Chicago",
    region: "IL",
    countryCode: "US",
    aliases: ["chicago"],
  },
  {
    key: "denver",
    label: "Denver",
    city: "Denver",
    region: "CO",
    countryCode: "US",
    aliases: ["denver", "boulder"],
  },
  { key: "miami", label: "Miami", city: "Miami", region: "FL", countryCode: "US", aliases: ["miami"] },
  {
    key: "london",
    label: "London",
    city: "London",
    region: "England",
    countryCode: "GB",
    aliases: ["london"],
  },
  {
    key: "toronto",
    label: "Toronto",
    city: "Toronto",
    region: "ON",
    countryCode: "CA",
    aliases: ["toronto"],
  },
  { key: "berlin", label: "Berlin", city: "Berlin", region: "BE", countryCode: "DE", aliases: ["berlin"] },
  {
    key: "bangalore",
    label: "Bengaluru",
    city: "Bengaluru",
    region: "KA",
    countryCode: "IN",
    aliases: ["bangalore", "bengaluru"],
  },
];

export const METRO_BY_KEY: Record<string, Metro> = Object.fromEntries(METROS.map((m) => [m.key, m]));

const ALIAS_LIST = METROS.flatMap((m) => m.aliases.map((a) => ({ alias: a, metro: m }))).sort(
  (a, b) => b.alias.length - a.alias.length,
);

export interface MetroMention {
  metro: Metro;
  start: number;
  end: number;
}

/** Find metro mentions with word boundaries. Short aliases ("sf", "la") must be uppercase in source. */
export function findMetros(text: string): MetroMention[] {
  const out: MetroMention[] = [];
  const taken: [number, number][] = [];
  for (const { alias, metro } of ALIAS_LIST) {
    // Two-letter aliases ("SF", "LA") only count when written in capitals to avoid false hits.
    const short = alias.length <= 2;
    const pattern = (short ? alias.toUpperCase() : alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(`\\b${pattern}\\b`, short ? "g" : "gi");
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      if (taken.some(([a, b]) => s < b && e > a)) continue;
      taken.push([s, e]);
      out.push({ metro, start: s, end: e });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function metroForCity(city: string | null | undefined): Metro | null {
  if (!city) return null;
  const c = city.toLowerCase().trim();
  return METROS.find((m) => m.aliases.includes(c) || m.city.toLowerCase() === c) ?? null;
}
