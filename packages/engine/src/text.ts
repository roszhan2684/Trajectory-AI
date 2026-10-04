/**
 * Text processing shared by search, NLP and the ML models.
 * Tokenization MUST stay byte-for-byte compatible with ml/train.py (see tests/ml-parity.test.ts).
 */
import skillsData from "./data/skills.json";
import stopwordsData from "./data/stopwords.json";

export interface SkillDef {
  key: string;
  display: string;
  category: string;
  aliases: string[];
}

export const SKILLS: SkillDef[] = skillsData as SkillDef[];
export const SKILL_BY_KEY: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.key, s]));
export const STOPWORDS = new Set<string>(stopwordsData as string[]);

const TOKEN_RE = /[a-z0-9][a-z0-9+#.]*/g;

export interface Token {
  text: string;
  start: number;
  end: number;
}

/** Tokens with character offsets into the ORIGINAL text. */
export function tokenizeWithOffsets(text: string): Token[] {
  const lower = asciiLower(text);
  const out: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(lower))) {
    let t = m[0];
    while (t.endsWith(".")) t = t.slice(0, -1);
    if (t) out.push({ text: t, start: m.index, end: m.index + t.length });
  }
  return out;
}

export function tokenize(text: string): string[] {
  return tokenizeWithOffsets(text).map((t) => t.text);
}

/** Lowercase only ASCII letters so offsets stay aligned with the original string. */
function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

const DIGITS = /^\d+$/;

/** Content terms: stopwords/digits removed, plus adjacent bigrams (matches Python `terms`). */
export function terms(tokens: string[]): string[] {
  const kept = tokens.filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !DIGITS.test(t));
  const bigrams: string[] = [];
  for (let i = 0; i < kept.length - 1; i++) bigrams.push(`${kept[i]}_${kept[i + 1]}`);
  return kept.concat(bigrams);
}

// ------------------------------------------------------------------------------ skill extraction
const ALIAS_INDEX = new Map<string, { toks: string[]; key: string }[]>();
for (const s of SKILLS) {
  for (const a of s.aliases) {
    const toks = tokenize(a);
    const first = toks[0];
    if (!first) continue;
    const list = ALIAS_INDEX.get(first) ?? [];
    list.push({ toks, key: s.key });
    ALIAS_INDEX.set(first, list);
  }
}
for (const list of ALIAS_INDEX.values()) list.sort((a, b) => b.toks.length - a.toks.length);

export interface SkillMention {
  key: string;
  start: number;
  end: number;
  surface: string;
}

/** Longest-alias-first skill matching with character spans (matches Python `extract_skills`). */
export function extractSkillMentions(text: string): SkillMention[] {
  const toks = tokenizeWithOffsets(text);
  const out: SkillMention[] = [];
  let i = 0;
  while (i < toks.length) {
    let matched = 0;
    const cands = ALIAS_INDEX.get(toks[i]!.text);
    if (cands) {
      for (const c of cands) {
        const L = c.toks.length;
        let ok = i + L <= toks.length;
        for (let j = 0; ok && j < L; j++) if (toks[i + j]!.text !== c.toks[j]) ok = false;
        if (ok) {
          const start = toks[i]!.start;
          const end = toks[i + L - 1]!.end;
          out.push({ key: c.key, start, end, surface: text.slice(start, end) });
          matched = L;
          break;
        }
      }
    }
    i += matched || 1;
  }
  return out;
}

export function extractSkills(text: string): Set<string> {
  return new Set(extractSkillMentions(text).map((m) => m.key));
}

// ------------------------------------------------------------------------------ years
const YEARS_REQ_RE = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)/g;
const RANGE_RE =
  /(?:\d{1,2}\/)?((?:19|20)\d{2})\s*(?:-|–|—|to)\s*(?:(?:\d{1,2}\/)?((?:19|20)\d{2})|(present|current|now))/g;

export function yearsRequired(text: string): number | null {
  const lower = asciiLower(text);
  const vals: number[] = [];
  for (const m of lower.matchAll(YEARS_REQ_RE)) {
    const v = parseInt(m[1]!, 10);
    if (v > 0 && v <= 20) vals.push(v);
  }
  return vals.length ? Math.min(...vals) : null;
}

export function yearsExperienceFromText(text: string, presentYear: number): number {
  const lower = asciiLower(text);
  const intervals: [number, number][] = [];
  for (const m of lower.matchAll(RANGE_RE)) {
    const s = parseInt(m[1]!, 10);
    const e = m[3] ? presentYear : parseInt(m[2]!, 10);
    if (s >= 1970 && s <= presentYear && s <= e && e <= presentYear) intervals.push([s, e]);
  }
  if (!intervals.length) return 0;
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let total = 0;
  let [cs, ce] = intervals[0]!;
  for (const [s, e] of intervals.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      cs = s;
      ce = e;
    }
  }
  total += ce - cs;
  return Math.min(total, 40);
}

// ------------------------------------------------------------------------------ misc helpers
/** FNV-1a 32-bit, hex. Used for content hashes (index drift) and pseudonymous IDs. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function clamp(x: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

export function round(x: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export function sentenceCase(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function yearsBetween(startIso: string, endIso: string | null, now: Date): number {
  const s = new Date(startIso).getTime();
  const e = endIso ? new Date(endIso).getTime() : now.getTime();
  return Math.max(0, (e - s) / (365.25 * 24 * 3600 * 1000));
}
