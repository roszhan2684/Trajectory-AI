/**
 * Layer B — deterministic feature scoring (spec §16.3).
 * Every feature returns raw value, normalized value, evidence references and explanation-ready
 * metadata. No model decides any number here.
 */
import type {
  Candidate,
  CandidateExperience,
  EvidenceNode,
  FeatureKey,
  FeatureStatus,
  ID,
  RoleRequirement,
} from "../types";
import { SKILL_BY_KEY, clamp, round, yearsBetween } from "../text";
import { cosine, semanticScoreFromCosine } from "../ml/lsa";
import { candidateMetroKey, hasSkillNegativeAnswer, roleMetroKey } from "./constraints";
import type { CandidateContext, RoleContext } from "./context";
import { FEATURE_LABELS } from "./config";

export interface FeatureResult {
  key: FeatureKey;
  label: string;
  applicable: boolean;
  rawValue: number | string | null;
  normalizedValue: number;
  status: FeatureStatus;
  evidenceIds: ID[];
  explanation: string;
  missing: string[];
}

// ------------------------------------------------------------------------------- helpers
const ADJACENT: Record<string, string[]> = {
  typescript: ["javascript"],
  javascript: ["typescript"],
  nextjs: ["react"],
  react: ["nextjs", "vue", "svelte", "react_native"],
  vue: ["react", "svelte"],
  typesense: ["elasticsearch", "search"],
  elasticsearch: ["typesense", "search"],
  search: ["typesense", "elasticsearch", "ranking"],
  ranking: ["search", "machine_learning"],
  trigger_dev: ["temporal", "durable_workflows"],
  temporal: ["trigger_dev", "durable_workflows"],
  durable_workflows: ["trigger_dev", "temporal", "kafka"],
  postgresql: ["mysql", "supabase"],
  supabase: ["postgresql", "firebase"],
  prisma: ["drizzle"],
  drizzle: ["prisma"],
  llm: ["rag", "langchain", "ai_sdk", "agents"],
  ai_sdk: ["llm"],
  agents: ["llm", "mcp"],
  rag: ["llm", "search"],
  mcp: ["agents", "llm"],
  llm_evals: ["machine_learning", "statistics"],
  nodejs: ["typescript", "javascript"],
  aws: ["gcp", "azure"],
  gcp: ["aws", "azure"],
  azure: ["aws", "gcp"],
  kubernetes: ["docker"],
  machine_learning: ["deep_learning", "statistics"],
  deep_learning: ["machine_learning"],
  figma: ["ux_design"],
  ux_design: ["figma", "product_sense"],
  go: ["rust"],
  rust: ["go", "cpp"],
  ios: ["swift", "react_native"],
  android: ["kotlin", "react_native"],
  fastapi: ["django", "python"],
  django: ["fastapi", "python"],
};

export interface SkillSupport {
  key: string;
  level: number;
  status: "supported" | "partial" | "inferred" | "adjacent" | "missing" | "negative" | "conflicted";
  evidenceIds: ID[];
  via: string | null;
}

function skillNodes(c: Candidate, key: string): EvidenceNode[] {
  return c.evidence
    .filter((n) => n.skills.includes(key) && n.type !== "PROFILE_FIELD")
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.confidence - a.confidence);
}

export function skillSupport(c: Candidate, key: string, now: Date): SkillSupport {
  if (hasSkillNegativeAnswer(c, key)) {
    const ans = c.evidence
      .filter((n) => n.type === "ANSWER" && n.metadata.negativeSkill === key)
      .map((n) => n.id);
    return { key, level: 0, status: "negative", evidenceIds: ans, via: null };
  }
  const skill = c.skills.find((s) => s.skillKey === key);
  if (skill) {
    const claim = c.claims.find((cl) => cl.claimType === "skill" && cl.claimKey === key);
    const nodes = skillNodes(c, key);
    let base = 0.45;
    let status: SkillSupport["status"] = "inferred";
    if (claim?.status === "SUPPORTED") [base, status] = [1, "supported"];
    else if (claim?.status === "PARTIAL") [base, status] = [0.8, "partial"];
    else if (claim?.status === "CONFLICTED") [base, status] = [0.55, "conflicted"];
    if (skill.inferred && status !== "supported") [base, status] = [0.45, "inferred"];
    const age = skill.lastUsedAt ? yearsBetween(skill.lastUsedAt, null, now) : 3;
    const recency = age <= 2 ? 1 : age <= 5 ? 0.85 : 0.65;
    return { key, level: base * recency, status, evidenceIds: nodes.slice(0, 3).map((n) => n.id), via: null };
  }
  for (const adj of ADJACENT[key] ?? []) {
    if (c.skills.some((s) => s.skillKey === adj && !s.inferred)) {
      return {
        key,
        level: 0.5,
        status: "adjacent",
        evidenceIds: skillNodes(c, adj)
          .slice(0, 2)
          .map((n) => n.id),
        via: adj,
      };
    }
  }
  return { key, level: 0, status: "missing", evidenceIds: [], via: null };
}

function expNode(c: Candidate, e: CandidateExperience): EvidenceNode | undefined {
  return c.evidence.find((n) => n.type === "EXPERIENCE" && n.metadata.experienceId === e.id);
}

function yearsAgo(iso: string | null, now: Date): number {
  return iso ? yearsBetween(iso, null, now) : 0;
}

function saturating(n: number, k: number): number {
  return 1 - Math.exp(-n / k);
}

function feature(key: FeatureKey, partial: Omit<FeatureResult, "key" | "label">): FeatureResult {
  return {
    key,
    label: FEATURE_LABELS[key],
    ...partial,
    normalizedValue: round(clamp(partial.normalizedValue), 4),
  };
}

// ------------------------------------------------------------------------------- features
/** Alternative skills satisfy one requirement together ("search (Typesense or Elasticsearch)"). */
export const SKILL_FAMILIES: { key: string; label: string; members: string[] }[] = [
  { key: "search", label: "Production search", members: ["search", "typesense", "elasticsearch", "ranking"] },
  {
    key: "durable_workflows",
    label: "Durable workflows",
    members: ["durable_workflows", "trigger_dev", "temporal"],
  },
  { key: "aws", label: "Cloud platform", members: ["aws", "gcp", "azure"] },
  { key: "prisma", label: "TypeScript ORM", members: ["prisma", "drizzle"] },
];
const FAMILY_OF: Record<string, (typeof SKILL_FAMILIES)[number]> = Object.fromEntries(
  SKILL_FAMILIES.flatMap((f) => f.members.map((m) => [m, f])),
);
const IMP_RANK = { MUST: 3, STRONG: 2, NICE: 1 } as const;

interface SkillGroup {
  req: RoleRequirement; // representative (label/importance/weight of the group)
  members: RoleRequirement[];
}

export function groupSkillRequirements(reqs: RoleRequirement[]): SkillGroup[] {
  const groups = new Map<string, SkillGroup>();
  for (const r of reqs.filter((x) => x.category === "SKILL")) {
    const fam = FAMILY_OF[r.normalizedKey];
    const gk = fam?.key ?? r.normalizedKey;
    const g = groups.get(gk);
    if (!g) groups.set(gk, { req: r, members: [r] });
    else {
      g.members.push(r);
      if (IMP_RANK[r.importance] > IMP_RANK[g.req.importance]) g.req = r;
    }
  }
  return [...groups.entries()].map(([gk, g]) => {
    if (g.members.length === 1) return g;
    const fam = FAMILY_OF[gk]!;
    const specific = g.members.filter((m) => m.normalizedKey !== fam.key).map((m) => m.label);
    const label = specific.length ? `${fam.label} (${specific.join(" / ")})` : fam.label;
    return {
      ...g,
      req: { ...g.req, label, normalizedKey: fam.key, weight: Math.max(...g.members.map((m) => m.weight)) },
    };
  });
}

export function technicalSkillFit(
  rc: RoleContext,
  c: Candidate,
): FeatureResult & { supports: (SkillSupport & { req: RoleRequirement })[] } {
  const groups = groupSkillRequirements(rc.reqs);
  if (!groups.length) {
    return {
      ...feature("technical_skill_fit", {
        applicable: false,
        rawValue: null,
        normalizedValue: 0,
        status: "unknown",
        evidenceIds: [],
        explanation: "Role lists no skill requirements.",
        missing: [],
      }),
      supports: [],
    };
  }
  const supports = groups.map((g) => {
    const best = g.members
      .map((m) => skillSupport(c, m.normalizedKey, rc.now))
      .sort((a, b) => b.level - a.level)[0]!;
    return { ...best, key: g.req.normalizedKey, req: g.req };
  });
  let num = 0;
  let den = 0;
  for (const s of supports) {
    num += s.req.weight * s.level;
    den += s.req.weight;
  }
  const strong = supports.filter((s) => s.status === "supported" || s.status === "partial");
  const missing = supports.filter(
    (s) => s.status === "missing" || s.status === "inferred" || s.status === "adjacent",
  );
  const mustMissing = supports.filter(
    (s) => s.req.importance === "MUST" && (s.status === "missing" || s.status === "negative"),
  );
  const status: FeatureStatus =
    missing.length === 0 && !supports.some((s) => s.status === "negative") ? "known" : "partial";
  const named = strong
    .slice(0, 3)
    .map((s) => s.req.label)
    .join(", ");
  return {
    ...feature("technical_skill_fit", {
      applicable: true,
      rawValue: `${strong.length}/${supports.length} skill requirements evidenced`,
      normalizedValue: num / den,
      status,
      evidenceIds: [...new Set(supports.flatMap((s) => s.evidenceIds))].slice(0, 8),
      explanation: strong.length
        ? `Evidence for ${named}${strong.length > 3 ? ` and ${strong.length - 3} more` : ""}.${mustMissing.length ? ` No evidence yet for must-have ${mustMissing.map((s) => s.req.label).join(", ")}.` : ""}`
        : "Little direct evidence of the required skills.",
      missing: missing.map((s) =>
        s.status === "adjacent"
          ? `${s.req.label} (has adjacent ${SKILL_BY_KEY[s.via ?? ""]?.display ?? s.via})`
          : s.status === "inferred"
            ? `${s.req.label} (listed, not demonstrated)`
            : s.req.label,
      ),
    }),
    supports,
  };
}

function yearsFit(y: number, min: number | null, max: number | null): number {
  if (min !== null && y < min) return clamp(y / min) ** 1.5;
  if (max !== null && y > max) return clamp(1 - 0.07 * (y - max), 0.55, 1);
  return 1;
}

export function relevantExperienceFit(rc: RoleContext, cc: CandidateContext): FeatureResult {
  const c = cc.c;
  if (!c.experiences.length) {
    return feature("relevant_experience_fit", {
      applicable: true,
      rawValue: null,
      normalizedValue: 0.3,
      status: "unknown",
      evidenceIds: [],
      explanation: "No work history on record.",
      missing: ["work history"],
    });
  }
  const scored = c.experiences.map((e) => {
    const sim = semanticScoreFromCosine(cosine(rc.emb, cc.expEmb.get(e.id)!));
    const dur = Math.max(0.25, yearsBetween(e.startDate, e.endDate, rc.now));
    const rec = 0.85 ** yearsAgo(e.endDate, rc.now);
    return { e, sim, dur, rec };
  });
  const den = scored.reduce((s, x) => s + x.dur * x.rec, 0);
  const relevance = clamp(scored.reduce((s, x) => s + x.sim * x.dur * x.rec, 0) / den / 0.85);
  const relevantYears = scored.filter((x) => x.sim >= 0.45).reduce((s, x) => s + x.dur, 0);
  const y = c.yearsExperience ?? scored.reduce((s, x) => s + x.dur, 0);
  const hasRange = rc.role.minYears !== null || rc.role.maxYears !== null;
  const yf = yearsFit(y, rc.role.minYears, rc.role.maxYears);
  const value = hasRange ? 0.4 * yf + 0.6 * relevance : relevance;
  const top = [...scored].sort((a, b) => b.sim * b.rec - a.sim * a.rec).slice(0, 2);
  const range = hasRange
    ? ` (role asks ${rc.role.minYears ?? 0}${rc.role.maxYears ? `–${rc.role.maxYears}` : "+"} yrs)`
    : "";
  return feature("relevant_experience_fit", {
    applicable: true,
    rawValue: `${round(y, 1)} yrs, ${round(relevantYears, 1)} highly relevant`,
    normalizedValue: value,
    status: "known",
    evidenceIds: top.map((x) => expNode(c, x.e)?.id).filter((x): x is string => !!x),
    explanation: `${round(y, 1)} years total${range}; most relevant: ${top.map((x) => `${x.e.title} at ${x.e.company}`).join("; ")}.${yf < 0.8 && rc.role.maxYears !== null && y > rc.role.maxYears ? " Possibly overqualified." : ""}`,
    missing:
      yf < 0.7 && rc.role.minYears !== null && y < rc.role.minYears
        ? [`${rc.role.minYears}+ years of experience`]
        : [],
  });
}

const EARLY = ["pre-seed", "seed", "series-a"];
const STAGE_ORDER = ["pre-seed", "seed", "series-a", "series-b", "growth", "public"];

export function startupStageFit(rc: RoleContext, c: Candidate): FeatureResult {
  const known = c.experiences.filter((e) => e.companyStage);
  if (!known.length) {
    return feature("startup_stage_fit", {
      applicable: true,
      rawValue: null,
      normalizedValue: 0.5,
      status: "unknown",
      evidenceIds: [],
      explanation: "Company stages in work history are unknown.",
      missing: ["company stage of past employers"],
    });
  }
  const roleIdx = STAGE_ORDER.indexOf(rc.role.companyStage);
  const roleEarly = EARLY.includes(rc.role.companyStage);
  const matches = known.filter((e) =>
    roleEarly
      ? EARLY.includes(e.companyStage!)
      : Math.abs(STAGE_ORDER.indexOf(e.companyStage!) - roleIdx) <= 1,
  );
  const yrs = matches.reduce(
    (s, e) => s + yearsBetween(e.startDate, e.endDate, rc.now) * 0.92 ** yearsAgo(e.endDate, rc.now),
    0,
  );
  const founder = matches.some((e) => /found/i.test(e.title));
  const value = clamp(saturating(yrs, 2.2) + (founder ? 0.1 : 0));
  return feature("startup_stage_fit", {
    applicable: true,
    rawValue: `${round(yrs, 1)} weighted yrs at comparable stage`,
    normalizedValue: value,
    status: known.length === c.experiences.length ? "known" : "partial",
    evidenceIds: matches
      .map((e) => expNode(c, e)?.id)
      .filter((x): x is string => !!x)
      .slice(0, 4),
    explanation: matches.length
      ? `${matches.length} role(s) at ${roleEarly ? "pre-seed → Series A" : "comparable-stage"} companies (${matches
          .map((e) => e.company)
          .slice(0, 3)
          .join(", ")})${founder ? ", including a founding role" : ""}.`
      : `No experience at ${roleEarly ? "early-stage startups" : "companies of this stage"} on record.`,
    missing: matches.length ? [] : ["early-stage company experience"],
  });
}

export function ownershipSignal(rc: RoleContext, c: Candidate): FeatureResult {
  // Bullet/project-level nodes only: EXPERIENCE nodes aggregate their bullets' tags (no double counting).
  const nodes = c.evidence.filter((n) => n.tags.includes("ownership") && n.type !== "EXPERIENCE");
  const weighted = nodes.reduce(
    (s, n) => s + 0.9 ** yearsAgo(n.observedAt, rc.now) * (n.verified ? 1.15 : 1),
    0,
  );
  const top = [...nodes].sort((a, b) => (b.observedAt ?? "").localeCompare(a.observedAt ?? "")).slice(0, 4);
  return feature("ownership_signal", {
    applicable: true,
    rawValue: `${nodes.length} ownership signals`,
    normalizedValue: saturating(weighted, 2.2),
    status: c.experiences.length ? "known" : "unknown",
    evidenceIds: top.map((n) => n.id),
    explanation: nodes.length
      ? `Owned work end-to-end: ${top
          .slice(0, 2)
          .map((n) => `“${n.body.slice(0, 70)}${n.body.length > 70 ? "…" : ""}”`)
          .join(" · ")}`
      : "No explicit end-to-end ownership found in evidence.",
    missing: nodes.length ? [] : ["examples of end-to-end ownership"],
  });
}

const AI_SKILLS = ["llm", "rag", "ai_sdk", "langchain", "llm_evals", "agents", "mcp", "nlp"];

export function aiProductSignal(rc: RoleContext, c: Candidate): FeatureResult {
  if (!rc.isAiRole) {
    return feature("ai_product_signal", {
      applicable: false,
      rawValue: null,
      normalizedValue: 0,
      status: "known",
      evidenceIds: [],
      explanation: "Not an AI-focused role.",
      missing: [],
    });
  }
  const shipped = c.evidence.filter((n) => n.tags.includes("ai_shipped") && n.type !== "EXPERIENCE");
  const aiSkills = c.skills.filter((s) => AI_SKILLS.includes(s.skillKey) && !s.inferred);
  const value = 0.65 * saturating(shipped.length, 1.2) + 0.35 * saturating(aiSkills.length, 2);
  return feature("ai_product_signal", {
    applicable: true,
    rawValue: `${shipped.length} shipped AI features, ${aiSkills.length} AI skills`,
    normalizedValue: value,
    status: shipped.length || aiSkills.length ? "known" : "partial",
    evidenceIds: [
      ...shipped.map((n) => n.id),
      ...aiSkills.flatMap((s) =>
        skillNodes(c, s.skillKey)
          .slice(0, 1)
          .map((n) => n.id),
      ),
    ].slice(0, 5),
    explanation: shipped.length
      ? `Shipped AI/LLM functionality to users (${shipped.length} instance${shipped.length > 1 ? "s" : ""}).`
      : aiSkills.length
        ? `AI skills (${aiSkills.map((s) => s.displayName).join(", ")}) but no shipped AI product evidence.`
        : "No AI product evidence.",
    missing: shipped.length ? [] : ["shipped LLM/AI features in production"],
  });
}

export interface TrajectoryPoint {
  id: ID;
  kind: "experience" | "project";
  label: string;
  sublabel: string;
  start: number; // fractional year
  end: number;
  alignment: number; // 0..1 semantic alignment with role
  seniority: number;
  evidenceId: ID | null;
}

export interface Trajectory {
  points: TrajectoryPoint[];
  recentAlignment: number;
  earlyAlignment: number | null;
  momentum: number;
  heading: "toward" | "steady" | "away" | "unknown";
}

function fracYear(iso: string | null, now: Date): number {
  const d = iso ? new Date(iso) : now;
  return d.getUTCFullYear() + d.getUTCMonth() / 12;
}

/** Where is this candidate heading? Compares alignment of recent vs earlier work with the role. */
export function computeTrajectory(rc: RoleContext, cc: CandidateContext): Trajectory {
  const c = cc.c;
  const pts: TrajectoryPoint[] = c.experiences.map((e) => ({
    id: e.id,
    kind: "experience" as const,
    label: e.title,
    sublabel: e.company,
    start: fracYear(e.startDate, rc.now),
    end: fracYear(e.endDate, rc.now),
    alignment: semanticScoreFromCosine(cosine(rc.emb, cc.expEmb.get(e.id)!)),
    seniority: e.seniority,
    evidenceId: expNode(c, e)?.id ?? null,
  }));
  for (const p of c.projects) {
    if (!p.startDate) continue;
    pts.push({
      id: p.id,
      kind: "project",
      label: p.name,
      sublabel: p.solo ? "Solo project" : "Project",
      start: fracYear(p.startDate, rc.now),
      end: fracYear(p.endDate, rc.now),
      alignment: semanticScoreFromCosine(cosine(rc.emb, cc.projEmb.get(p.id)!)),
      seniority: 0,
      evidenceId: c.evidence.find((n) => n.type === "PROJECT" && n.metadata.projectId === p.id)?.id ?? null,
    });
  }
  pts.sort((a, b) => a.start - b.start);
  if (!pts.length)
    return { points: [], recentAlignment: 0, earlyAlignment: null, momentum: 0, heading: "unknown" };
  const nowY = fracYear(null, rc.now);
  // Direction is measured on employment history; side projects are plotted but not averaged
  // (short project blurbs embed poorly and would understate alignment).
  const jobs = pts.filter((p) => p.kind === "experience");
  const basis = jobs.length ? jobs : pts;
  const recent = basis.filter((p) => p.end >= nowY - 2.5);
  const early = basis.filter((p) => p.end < nowY - 2.5);
  const avg = (xs: TrajectoryPoint[]) => {
    const w = xs.reduce((s, p) => s + Math.max(0.3, p.end - p.start), 0);
    return xs.reduce((s, p) => s + p.alignment * Math.max(0.3, p.end - p.start), 0) / (w || 1);
  };
  const recentAlignment = recent.length ? avg(recent) : avg(basis.slice(-1));
  const earlyAlignment = early.length ? avg(early) : null;
  const momentum = earlyAlignment === null ? 0 : recentAlignment - earlyAlignment;
  const heading =
    earlyAlignment === null ? "steady" : momentum > 0.08 ? "toward" : momentum < -0.08 ? "away" : "steady";
  return { points: pts, recentAlignment, earlyAlignment, momentum, heading };
}

export function careerTrajectoryFit(rc: RoleContext, cc: CandidateContext, t: Trajectory): FeatureResult {
  if (!t.points.length) {
    return feature("career_trajectory_fit", {
      applicable: true,
      rawValue: null,
      normalizedValue: 0.4,
      status: "unknown",
      evidenceIds: [],
      explanation: "Not enough history to estimate direction.",
      missing: ["work history"],
    });
  }
  const aiBoost = rc.isAiRole && cc.c.preferences.wantsAiWork ? 0.05 : 0;
  const value = clamp(
    0.65 * clamp(t.recentAlignment / 0.85) + 0.35 * clamp(0.5 + t.momentum * 1.5) + aiBoost,
  );
  const recentPts = t.points
    .filter((p) => p.evidenceId)
    .sort((a, b) => b.end - a.end || b.alignment - a.alignment)
    .slice(0, 3);
  const dir =
    t.heading === "toward"
      ? "Heading toward this role"
      : t.heading === "away"
        ? "Recent work is drifting away from this role"
        : "Steady alignment with this role";
  return feature("career_trajectory_fit", {
    applicable: true,
    rawValue: `momentum ${t.momentum >= 0 ? "+" : ""}${round(t.momentum, 2)}`,
    normalizedValue: value,
    status: "known",
    evidenceIds: recentPts.map((p) => p.evidenceId!),
    explanation: `${dir}: recent work alignment ${Math.round(t.recentAlignment * 100)}%${t.earlyAlignment !== null ? ` vs. ${Math.round(t.earlyAlignment * 100)}% earlier` : ""}.`,
    missing: [],
  });
}

export function candidatePreferenceFit(rc: RoleContext, c: Candidate): FeatureResult {
  const p = c.preferences;
  const role = rc.role;
  const items: { label: string; value: number | null }[] = [];
  const mode =
    role.locationMode === "ONSITE" ? "onsite" : role.locationMode === "HYBRID" ? "hybrid" : "remote";
  items.push({ label: "work mode", value: p.workModes === null ? null : p.workModes.includes(mode) ? 1 : 0 });
  items.push({
    label: "company stage",
    value: p.desiredStages === null ? null : p.desiredStages.includes(role.companyStage) ? 1 : 0.3,
  });
  if (role.teamSize !== null) {
    const known = p.minTeamSize !== null || p.maxTeamSize !== null;
    const ok =
      (p.minTeamSize === null || role.teamSize >= p.minTeamSize) &&
      (p.maxTeamSize === null || role.teamSize <= p.maxTeamSize);
    items.push({ label: "team size", value: known ? (ok ? 1 : 0.3) : null });
  }
  if (role.domain)
    items.push({
      label: "domain",
      value: p.domains === null ? null : p.domains.includes(role.domain) ? 1 : 0.5,
    });
  if (rc.isAiRole)
    items.push({ label: "AI work", value: p.wantsAiWork === null ? null : p.wantsAiWork ? 1 : 0.4 });
  const known = items.filter((i) => i.value !== null);
  const value = items.reduce((s, i) => s + (i.value ?? 0.5), 0) / items.length;
  const prefNodes = c.evidence.filter((n) => n.tags.includes("preference")).map((n) => n.id);
  const mismatched = known.filter((i) => (i.value ?? 1) < 0.6).map((i) => i.label);
  return feature("candidate_preference_fit", {
    applicable: true,
    rawValue: `${known.length}/${items.length} preferences known`,
    normalizedValue: value,
    status: known.length === items.length ? "known" : known.length ? "partial" : "unknown",
    evidenceIds: prefNodes.slice(0, 4),
    explanation: known.length
      ? `Matches stated preferences on ${
          known
            .filter((i) => (i.value ?? 0) >= 0.99)
            .map((i) => i.label)
            .join(", ") || "none"
        }${mismatched.length ? `; mismatch on ${mismatched.join(", ")}` : ""}.`
      : "Candidate hasn't stated preferences relevant to this role.",
    missing: items.filter((i) => i.value === null).map((i) => `preference: ${i.label}`),
  });
}

export function locationFit(rc: RoleContext, c: Candidate): FeatureResult {
  const role = rc.role;
  const locNode = c.evidence.find((n) => n.type === "PROFILE_FIELD" && n.metadata.field === "location");
  const ids = locNode ? [locNode.id] : [];
  if (role.locationMode === "REMOTE") {
    const v = c.countryCode === null ? 0.5 : c.countryCode === role.countryCode ? 1 : 0.6;
    return feature("location_fit", {
      applicable: true,
      rawValue: c.city,
      normalizedValue: v,
      status: c.countryCode ? "known" : "unknown",
      evidenceIds: ids,
      explanation:
        v === 1
          ? `Remote role; candidate is in ${role.countryCode}.`
          : "Remote role; candidate location may complicate hiring.",
      missing: c.countryCode ? [] : ["location"],
    });
  }
  const same = roleMetroKey(role) !== null && candidateMetroKey(c) === roleMetroKey(role);
  const reloc = c.preferences.openToRelocate;
  const v = same ? 1 : reloc === true ? 0.75 : reloc === null ? 0.45 : 0;
  return feature("location_fit", {
    applicable: true,
    rawValue: c.city,
    normalizedValue: v,
    status: same || reloc !== null ? "known" : "unknown",
    evidenceIds: ids,
    explanation: same
      ? `Already in ${role.city}.`
      : reloc === true
        ? `In ${c.city ?? "another city"}, open to relocating.`
        : reloc === false
          ? `In ${c.city ?? "another city"}, not open to relocating.`
          : `In ${c.city ?? "unknown location"}; relocation willingness unknown.`,
    missing: same || reloc !== null ? [] : [`willingness to work in ${role.city}`],
  });
}

export function compensationFit(rc: RoleContext, c: Candidate): FeatureResult {
  const role = rc.role;
  if (role.maxComp === null) {
    return feature("compensation_fit", {
      applicable: false,
      rawValue: null,
      normalizedValue: 0,
      status: "unknown",
      evidenceIds: [],
      explanation: "Role has no compensation range.",
      missing: [],
    });
  }
  const compNode = c.evidence.find((n) => n.metadata.field === "compensation");
  if (c.salaryMin === null) {
    return feature("compensation_fit", {
      applicable: true,
      rawValue: null,
      normalizedValue: 0.5,
      status: "unknown",
      evidenceIds: [],
      explanation: "Compensation expectations unknown.",
      missing: ["compensation expectations"],
    });
  }
  const mid = ((role.minComp ?? role.maxComp) + role.maxComp) / 2;
  const v =
    c.salaryMin <= mid
      ? 1
      : c.salaryMin <= role.maxComp
        ? 0.9
        : clamp(1 - ((c.salaryMin - role.maxComp) / role.maxComp) * 4);
  return feature("compensation_fit", {
    applicable: true,
    rawValue: c.salaryMin,
    normalizedValue: v,
    status: "known",
    evidenceIds: compNode ? [compNode.id] : [],
    explanation:
      v >= 0.9 ? "Expectations fit within the role's range." : "Expectations sit above the role's range.",
    missing: [],
  });
}

const AVAIL: Record<string, number> = {
  immediate: 1,
  "2_weeks": 1,
  "1_month": 0.9,
  "3_months": 0.6,
  not_looking: 0.2,
};

export function availabilityFit(_rc: RoleContext, c: Candidate): FeatureResult {
  const n = c.evidence.find((x) => x.metadata.field === "availability");
  if (c.availability === null) {
    return feature("availability_fit", {
      applicable: true,
      rawValue: null,
      normalizedValue: 0.5,
      status: "unknown",
      evidenceIds: [],
      explanation: "Availability unknown.",
      missing: ["availability / notice period"],
    });
  }
  return feature("availability_fit", {
    applicable: true,
    rawValue: c.availability,
    normalizedValue: AVAIL[c.availability] ?? 0.5,
    status: "known",
    evidenceIds: n ? [n.id] : [],
    explanation:
      c.availability === "not_looking"
        ? "Not actively looking."
        : `Available ${c.availability.replace("_", " ")}.`,
    missing: [],
  });
}

export function evidenceConfidence(rc: RoleContext, c: Candidate): FeatureResult {
  const roleSkills = new Set(rc.reqs.filter((r) => r.category === "SKILL").map((r) => r.normalizedKey));
  const relevant = c.claims.filter(
    (cl) =>
      (cl.claimType === "skill" && roleSkills.has(cl.claimKey)) ||
      cl.claimType === "ownership" ||
      cl.claimType === "startup",
  );
  if (!relevant.length) {
    return feature("evidence_confidence", {
      applicable: true,
      rawValue: null,
      normalizedValue: 0.35,
      status: "partial",
      evidenceIds: [],
      explanation: "Few claims relevant to this role have supporting evidence.",
      missing: ["sources that corroborate key claims"],
    });
  }
  const factor = { SUPPORTED: 1, PARTIAL: 0.7, UNSUPPORTED: 0.3, CONFLICTED: 0.25 } as const;
  const v = relevant.reduce((s, cl) => s + factor[cl.status] * cl.confidence, 0) / relevant.length;
  const conflicted = relevant.filter((cl) => cl.status === "CONFLICTED");
  const verified = c.evidence.filter((n) => n.verified).length;
  const conflictIds = c.claimLinks
    .filter((l) => conflicted.some((cl) => cl.id === l.claimId))
    .map((l) => l.evidenceNodeId);
  return feature("evidence_confidence", {
    applicable: true,
    rawValue: `${relevant.filter((cl) => cl.status === "SUPPORTED").length}/${relevant.length} claims fully supported`,
    normalizedValue: clamp(v + Math.min(0.08, verified * 0.02)),
    status: conflicted.length ? "partial" : "known",
    evidenceIds: [...new Set(conflictIds)].slice(0, 4),
    explanation: `${relevant.filter((cl) => cl.status === "SUPPORTED").length} of ${relevant.length} relevant claims are supported by multiple sources${conflicted.length ? `; ${conflicted.length} conflicted (${conflicted.map((cl) => cl.claimValue).join(", ")})` : ""}.`,
    missing: conflicted.length ? conflicted.map((cl) => `resolve conflict: ${cl.claimValue}`) : [],
  });
}

export interface AllFeatures {
  features: FeatureResult[];
  skills: (SkillSupport & { req: RoleRequirement })[];
  trajectory: Trajectory;
}

export function computeFeatures(rc: RoleContext, cc: CandidateContext): AllFeatures {
  const c = cc.c;
  const tech = technicalSkillFit(rc, c);
  const trajectory = computeTrajectory(rc, cc);
  const { supports, ...techFeature } = tech;
  const features: FeatureResult[] = [
    techFeature,
    relevantExperienceFit(rc, cc),
    startupStageFit(rc, c),
    ownershipSignal(rc, c),
    aiProductSignal(rc, c),
    careerTrajectoryFit(rc, cc, trajectory),
    candidatePreferenceFit(rc, c),
    locationFit(rc, c),
    compensationFit(rc, c),
    availabilityFit(rc, c),
    evidenceConfidence(rc, c),
  ];
  return { features, skills: supports, trajectory };
}
