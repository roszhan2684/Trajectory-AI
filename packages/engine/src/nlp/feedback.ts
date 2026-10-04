/**
 * Ranking Feedback Interpreter (spec §18.6). Turns recruiter free text into PROPOSED changes over
 * an allowlist of preference features. Nothing changes ranking until a human confirms.
 * Pattern rules first; LSA semantic similarity as a low-confidence fallback for unmatched clauses.
 */
import type { PreferenceProposal } from "../types";
import { PREFERENCE_BY_KEY, PREFERENCE_FEATURES, MAX_PREFERENCE_DELTA } from "../preferences";
import { cosine, embed } from "../ml/lsa";
import { INTERPRETER_VERSION } from "../scoring/config";
import { detectProtectedTraits } from "./safety";

interface Rule {
  key: string;
  re: RegExp;
  /** key to use instead when the cue is positive (e.g. "prioritize enterprise" ⇒ scale) */
  positiveKey?: string;
  /** key to use instead when the cue is negative (e.g. "too senior" ⇒ hands-on +) */
  negativeKey?: string;
  invertNegative?: boolean;
}

const RULES: Rule[] = [
  {
    key: "enterprise_only_background",
    re: /\b(enterprise|corporate|big[- ]tech|big compan(?:y|ies)|large compan(?:y|ies)|faang|bureaucra\w*)\b/i,
    positiveKey: "big_tech_scale",
  },
  {
    key: "independent_product_ownership",
    re: /\b(shipped\b[^.,;]{0,25}\bindependently|independently\b[^.,;]{0,15}\bshipped|indie|solo|side[- ]projects?|built (?:their|his|her) own|founders?|founded|end[- ]to[- ]end|ownership|own(?:ed)? the (?:whole|entire)|self[- ]starters?|high[- ]agency)\b/i,
  },
  {
    key: "small_team_experience",
    re: /\b((?:small|tiny|lean|early) teams?|teams? (?:under|below|of less than|smaller than|<)\s*\d+|startups?|scrappy)\b/i,
  },
  {
    key: "early_stage_experience",
    re: /\b(early[- ]stage|pre[- ]?seed|seed[- ]stage|zero to one|0\s*(?:to|→|->)\s*1|founding)\b/i,
  },
  {
    key: "production_search_experience",
    re: /\b(search|ranking|relevance|retrieval|typesense|elastic\w*|information retrieval)\b/i,
  },
  {
    key: "durable_workflow_experience",
    re: /\b(workflows?|queues?|background jobs|temporal|trigger\.dev|orchestration|pipelines?)\b/i,
  },
  {
    key: "ai_product_shipping",
    re: /\b((?:llm|ai|gen ?ai|ml) (?:features?|products?|experience)|shipped (?:llm|ai)\w*|llms?)\b/i,
  },
  { key: "open_source_activity", re: /\b(open[- ]source|github|oss)\b/i },
  { key: "design_sensibility", re: /\b(design|taste|ux|polish|craft|pixel)\w*\b/i },
  {
    key: "customer_facing",
    re: /\b(customers?|user[- ]facing|talks? to users|user research|customer[- ]facing)\b/i,
  },
  {
    key: "leadership_experience",
    re: /\b(managers?|management|managerial|leaders?(?:hip)?|people leads?|too senior|executives?)\b/i,
    negativeKey: "recent_hands_on_coding",
    invertNegative: true,
  },
  {
    key: "recent_hands_on_coding",
    re: /\b(hands[- ]on|individual contributors?|ics?\b|still cod(?:e|ing)|writes? code|builders?)\b/i,
  },
  {
    key: "big_tech_scale",
    re: /\b(at scale|large[- ]scale|high[- ]traffic|millions of users|hyperscale)\b/i,
  },
  { key: "healthcare_domain", re: /\b(health\s?care|clinical|medical|hipaa|patients?)\b/i },
  { key: "fintech_domain", re: /\b(fintech|payments?|banking|financial services)\b/i },
];

const NEG =
  /\b(too|less|fewer|avoid|not|no|without|deprioriti[sz]e|down[- ]?(?:rank|weight)|penali[sz]e|exclude|don'?t want|stop|over[- ]?index(?:ed|ing)?)\b/i;
const STRONG_POS = /\b(prioriti[sz]e|must|really need|strongly prefer|focus on|top priority|emphasi[sz]e)\b/i;
const POS =
  /\b(prefer|more|want|need|boost|favou?r|look for|should have|value|important|surface|highlight)\b/i;
const INTENSIFY = /\b(really|very|way|much|strongly|heavily|definitely|extremely)\b/i;
const SOFTEN = /\b(slightly|a bit|somewhat|a little|maybe|marginally)\b/i;

export interface InterpretResult {
  proposals: PreferenceProposal[];
  unrecognized: string[];
  refused: string[];
  interpreterVersion: string;
}

function splitClauses(text: string): string[] {
  return text
    .split(
      /(?<=[.!?;])\s+|\n+|\s+but\s+|\s*,\s*(?=(?:and |but )?(?:prioriti|prefer|more|less|avoid|focus|too|need|want|boost))/i,
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

let prefEmb: { key: string; emb: Float32Array }[] | null = null;
function preferenceEmbeddings() {
  prefEmb ??= PREFERENCE_FEATURES.map((p) => ({ key: p.key, emb: embed(`${p.label}. ${p.description}`) }));
  return prefEmb;
}

export function interpretFeedback(text: string): InterpretResult {
  const proposals = new Map<string, PreferenceProposal>();
  const unrecognized: string[] = [];
  const refused: string[] = [];

  for (const flag of detectProtectedTraits(text)) {
    refused.push(
      `Ignored “${flag.excerpt}” — it refers to ${flag.kind}, a protected characteristic. Trajectory never ranks on protected traits.`,
    );
  }
  const protectedRe = detectProtectedTraits(text).map((f) => f.excerpt.toLowerCase());

  for (const clause of splitClauses(text)) {
    const clean = protectedRe.reduce(
      (s, p) => s.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " "),
      clause,
    );
    const negative = NEG.test(clean) && !/\bnot enough\b/i.test(clean);
    const strong = STRONG_POS.test(clean) || INTENSIFY.test(clean);
    const base = negative ? (strong ? 0.12 : 0.08) : strong ? 0.18 : POS.test(clean) ? 0.12 : 0.1;
    const mag = SOFTEN.test(clean) ? base / 2 : base;

    const hits: { rule: Rule; m: RegExpExecArray }[] = [];
    for (const rule of RULES) {
      const m = rule.re.exec(clean);
      if (m) hits.push({ rule, m });
    }
    hits.sort((a, b) => a.m.index - b.m.index);
    // A phrase like "shipped independently in teams under 30" should not also trigger "search"
    let i = 0;
    for (const { rule, m } of hits) {
      let key = rule.key;
      let sign = negative ? -1 : 1;
      if (negative && rule.negativeKey) {
        key = rule.negativeKey;
        if (rule.invertNegative) sign = 1;
      } else if (!negative && rule.positiveKey) key = rule.positiveKey;
      if (proposals.has(key)) continue;
      const delta = Math.round(sign * (i === 0 ? mag : mag * (2 / 3)) * 100) / 100;
      const pf = PREFERENCE_BY_KEY[key]!;
      proposals.set(key, {
        key,
        label: pf.label,
        delta: Math.max(-MAX_PREFERENCE_DELTA, Math.min(MAX_PREFERENCE_DELTA, delta)),
        confidence: strong || negative || POS.test(clean) ? 0.88 : 0.7,
        matchedPhrase: m[0],
        rationale: `“${m[0]}” → ${delta > 0 ? "boost" : "down-weight"} ${pf.label.toLowerCase()}`,
      });
      i++;
    }
    if (!hits.length) {
      // semantic fallback against allowlisted preference descriptions only
      const e = embed(clean);
      const best = preferenceEmbeddings()
        .map((p) => ({ key: p.key, sim: cosine(e, p.emb) }))
        .sort((a, b) => b.sim - a.sim)[0];
      if (best && best.sim >= 0.32 && !proposals.has(best.key)) {
        const pf = PREFERENCE_BY_KEY[best.key]!;
        const delta = Math.round((negative ? -1 : 1) * 0.08 * 100) / 100;
        proposals.set(best.key, {
          key: best.key,
          label: pf.label,
          delta,
          confidence: Math.round(Math.min(0.6, best.sim) * 100) / 100,
          matchedPhrase: clause,
          rationale: `Semantic match (${Math.round(best.sim * 100)}%) to “${pf.label}” — low confidence, please review`,
        });
      } else if (!refused.length || clean.trim().length > 3) {
        unrecognized.push(clause);
      }
    }
  }
  return {
    proposals: [...proposals.values()],
    unrecognized,
    refused,
    interpreterVersion: INTERPRETER_VERSION,
  };
}
