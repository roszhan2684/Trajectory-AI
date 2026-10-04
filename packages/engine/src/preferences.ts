/**
 * Allowlisted ranking-preference features. Recruiter feedback can only adjust these keys —
 * a model/parser can never introduce an arbitrary feature into ranking (spec §41).
 */
import type { Candidate, EvidenceNode, ID } from "./types";
import { clamp, yearsBetween } from "./text";

export interface PreferenceValue {
  value: number; // 0..1
  evidenceIds: ID[];
  detail: string;
}

export interface PreferenceFeature {
  key: string;
  label: string;
  description: string; // used for semantic fallback matching in the feedback interpreter
  extract: (c: Candidate, now: Date) => PreferenceValue;
}

const ENTERPRISE_BANDS = new Set(["1001-5000", "5001-10000", "10000+"]);
const SMALL_BANDS = new Set(["1-10", "11-50"]);

function careerSplit(c: Candidate, now: Date, pred: (e: Candidate["experiences"][number]) => boolean) {
  let total = 0;
  let hit = 0;
  const ids: ID[] = [];
  for (const e of c.experiences) {
    const y = yearsBetween(e.startDate, e.endDate, now);
    total += y;
    if (pred(e)) {
      hit += y;
      const node = c.evidence.find((n) => n.type === "EXPERIENCE" && n.metadata.experienceId === e.id);
      if (node) ids.push(node.id);
    }
  }
  return { fraction: total > 0 ? hit / total : 0, years: hit, ids, total };
}

function taggedNodes(c: Candidate, tag: string): EvidenceNode[] {
  return c.evidence.filter((n) => n.tags.includes(tag) && n.type !== "EXPERIENCE");
}

function skillNodes(c: Candidate, keys: string[]): EvidenceNode[] {
  return c.evidence.filter((n) => n.skills.some((s) => keys.includes(s)) && n.type !== "PROFILE_FIELD");
}

function saturating(n: number, k: number): number {
  return 1 - Math.exp(-n / k);
}

export const PREFERENCE_FEATURES: PreferenceFeature[] = [
  {
    key: "small_team_experience",
    label: "Small-team experience (≤ 30 people)",
    description: "worked in small teams startups tiny team under 30 people early stage company",
    extract: (c, now) => {
      const s = careerSplit(c, now, (e) =>
        e.teamSize !== null ? e.teamSize <= 30 : SMALL_BANDS.has(e.companySizeBand ?? ""),
      );
      return {
        value: clamp(s.fraction * 0.7 + saturating(s.years, 2) * 0.3),
        evidenceIds: s.ids,
        detail: `${s.years.toFixed(1)} yrs in teams ≤ 30`,
      };
    },
  },
  {
    key: "independent_product_ownership",
    label: "Independently shipped products",
    description:
      "shipped products independently solo founder built and launched own product end to end ownership indie hacker",
    extract: (c) => {
      const nodes = taggedNodes(c, "ownership");
      const solo = c.projects.filter((p) => p.solo && p.shipped);
      const soloNodes = c.evidence.filter(
        (n) => n.type === "PROJECT" && solo.some((p) => p.id === n.metadata.projectId),
      );
      const ids = [...new Set([...soloNodes, ...nodes].map((n) => n.id))];
      return {
        value: clamp(saturating(nodes.length, 2.5) * 0.6 + saturating(solo.length, 1) * 0.4),
        evidenceIds: ids.slice(0, 6),
        detail: `${nodes.length} ownership signals, ${solo.length} solo-shipped projects`,
      };
    },
  },
  {
    key: "enterprise_only_background",
    label: "Enterprise-only background",
    description: "enterprise big company corporate large organization bureaucratic big tech only background",
    extract: (c, now) => {
      const s = careerSplit(c, now, (e) => ENTERPRISE_BANDS.has(e.companySizeBand ?? ""));
      const indie =
        c.projects.some((p) => p.solo && p.shipped) ||
        c.experiences.some((e) => SMALL_BANDS.has(e.companySizeBand ?? ""));
      return {
        value: clamp(s.fraction * (indie ? 0.55 : 1)),
        evidenceIds: s.ids,
        detail: `${Math.round(s.fraction * 100)}% of career at 1,000+ person companies`,
      };
    },
  },
  {
    key: "early_stage_experience",
    label: "Early-stage startup experience",
    description: "early stage startup seed pre-seed series a founding engineer zero to one",
    extract: (c, now) => {
      const s = careerSplit(c, now, (e) => ["pre-seed", "seed", "series-a"].includes(e.companyStage ?? ""));
      return {
        value: clamp(saturating(s.years, 2.5)),
        evidenceIds: s.ids,
        detail: `${s.years.toFixed(1)} yrs at pre-seed → Series A`,
      };
    },
  },
  {
    key: "production_search_experience",
    label: "Production search / ranking",
    description: "production search engine ranking relevance typesense elasticsearch information retrieval",
    extract: (c) => {
      const nodes = skillNodes(c, ["search", "typesense", "elasticsearch", "ranking"]);
      return {
        value: clamp(saturating(nodes.length, 1.5)),
        evidenceIds: nodes.map((n) => n.id).slice(0, 5),
        detail: `${nodes.length} search/ranking evidence items`,
      };
    },
  },
  {
    key: "durable_workflow_experience",
    label: "Durable workflows / job systems",
    description: "durable workflows background jobs queues temporal trigger.dev orchestration",
    extract: (c) => {
      const nodes = skillNodes(c, ["trigger_dev", "temporal", "durable_workflows", "kafka"]);
      return {
        value: clamp(saturating(nodes.length, 1.5)),
        evidenceIds: nodes.map((n) => n.id).slice(0, 5),
        detail: `${nodes.length} workflow evidence items`,
      };
    },
  },
  {
    key: "ai_product_shipping",
    label: "Shipped AI/LLM features",
    description: "shipped llm features ai products generative ai in production",
    extract: (c) => {
      const nodes = taggedNodes(c, "ai_shipped");
      return {
        value: clamp(saturating(nodes.length, 1.2)),
        evidenceIds: nodes.map((n) => n.id).slice(0, 5),
        detail: `${nodes.length} shipped-AI evidence items`,
      };
    },
  },
  {
    key: "open_source_activity",
    label: "Open-source activity",
    description: "open source contributor maintainer github repositories stars",
    extract: (c) => {
      const repos = c.evidence.filter((n) => n.type === "REPOSITORY");
      const stars = repos.reduce((s, n) => s + Number(n.metadata.stars ?? 0), 0);
      return {
        value: clamp(saturating(repos.length, 3) * 0.5 + saturating(stars, 400) * 0.5),
        evidenceIds: repos.map((n) => n.id).slice(0, 5),
        detail: `${repos.length} public repos, ${stars} stars`,
      };
    },
  },
  {
    key: "design_sensibility",
    label: "Design / UX sensibility",
    description: "design taste ux user experience product design figma design systems polish",
    extract: (c) => {
      const nodes = skillNodes(c, ["ux_design", "figma", "design_systems", "accessibility"]);
      return {
        value: clamp(saturating(nodes.length, 2)),
        evidenceIds: nodes.map((n) => n.id).slice(0, 5),
        detail: `${nodes.length} design evidence items`,
      };
    },
  },
  {
    key: "customer_facing",
    label: "Customer-facing work",
    description: "customer facing talks to users user research customer discovery support sales engineering",
    extract: (c) => {
      const nodes = taggedNodes(c, "customer");
      return {
        value: clamp(saturating(nodes.length, 1.5)),
        evidenceIds: nodes.map((n) => n.id).slice(0, 5),
        detail: `${nodes.length} customer-facing evidence items`,
      };
    },
  },
  {
    key: "leadership_experience",
    label: "Leadership / management",
    description: "leadership managed team people manager tech lead mentoring senior leadership",
    extract: (c) => {
      const nodes = taggedNodes(c, "leadership");
      const maxSen = Math.max(0, ...c.experiences.map((e) => e.seniority));
      return {
        value: clamp(saturating(nodes.length, 2) * 0.6 + clamp((maxSen - 3) / 3) * 0.4),
        evidenceIds: nodes.map((n) => n.id).slice(0, 5),
        detail: `${nodes.length} leadership signals`,
      };
    },
  },
  {
    key: "recent_hands_on_coding",
    label: "Recent hands-on engineering",
    description: "hands on coding individual contributor writes code daily recent engineering not management",
    extract: (c) => {
      const recent = [...c.experiences].sort((a, b) => (b.startDate > a.startDate ? 1 : -1))[0];
      if (!recent) return { value: 0, evidenceIds: [], detail: "no experience on record" };
      const ic = /engineer|developer|programmer|scientist/i.test(recent.title) && recent.seniority <= 5;
      const node = c.evidence.find((n) => n.type === "EXPERIENCE" && n.metadata.experienceId === recent.id);
      return {
        value: ic ? 1 : 0.25,
        evidenceIds: node ? [node.id] : [],
        detail: `${recent.title} at ${recent.company}`,
      };
    },
  },
  {
    key: "big_tech_scale",
    label: "Large-scale systems experience",
    description: "large scale systems high traffic millions of users scale big tech infrastructure",
    extract: (c, now) => {
      const s = careerSplit(c, now, (e) => ENTERPRISE_BANDS.has(e.companySizeBand ?? ""));
      return {
        value: clamp(saturating(s.years, 3)),
        evidenceIds: s.ids,
        detail: `${s.years.toFixed(1)} yrs at large-scale companies`,
      };
    },
  },
  {
    key: "healthcare_domain",
    label: "Healthcare domain",
    description: "healthcare clinical patients hospitals hipaa medical",
    extract: (c) => {
      const nodes = skillNodes(c, ["healthcare"]);
      return {
        value: clamp(saturating(nodes.length, 1.5)),
        evidenceIds: nodes.map((n) => n.id).slice(0, 5),
        detail: `${nodes.length} healthcare evidence items`,
      };
    },
  },
  {
    key: "fintech_domain",
    label: "Fintech / payments domain",
    description: "fintech payments banking ledger money movement",
    extract: (c) => {
      const nodes = skillNodes(c, ["fintech"]);
      return {
        value: clamp(saturating(nodes.length, 1.5)),
        evidenceIds: nodes.map((n) => n.id).slice(0, 5),
        detail: `${nodes.length} fintech evidence items`,
      };
    },
  },
];

export const PREFERENCE_BY_KEY: Record<string, PreferenceFeature> = Object.fromEntries(
  PREFERENCE_FEATURES.map((p) => [p.key, p]),
);

export function isAllowedPreference(key: string): boolean {
  return key in PREFERENCE_BY_KEY;
}

export const MAX_PREFERENCE_DELTA = 0.3;
