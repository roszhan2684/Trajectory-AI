/**
 * Precomputed role/candidate representations. Building these is the expensive part of scoring
 * (embeddings), so the service layer caches them by content hash.
 */
import type { Candidate, FeatureKey, ID, JobRole, RolePreference, RoleRequirement } from "../types";
import { cosine, embed } from "../ml/lsa";
import { docInfo, type DocInfo } from "../ml/reranker";
import { DEFAULT_WEIGHTS } from "./config";

export interface RoleContext {
  role: JobRole;
  reqs: RoleRequirement[];
  prefs: RolePreference[];
  text: string;
  emb: Float32Array;
  doc: DocInfo;
  isAiRole: boolean;
  baseWeights: Record<FeatureKey, number>;
  now: Date;
}

export interface CandidateContext {
  c: Candidate;
  text: string;
  emb: Float32Array;
  doc: DocInfo;
  expEmb: Map<ID, Float32Array>;
  projEmb: Map<ID, Float32Array>;
  nodeEmb: Map<ID, Float32Array>;
}

const AI_KEYS = new Set([
  "llm",
  "rag",
  "ai_sdk",
  "langchain",
  "llm_evals",
  "agents",
  "machine_learning",
  "deep_learning",
  "nlp",
  "mcp",
]);

export function roleText(role: JobRole, reqs: RoleRequirement[]): string {
  return [
    role.title,
    role.descriptionNormalized || role.descriptionRaw,
    role.responsibilities.join(". "),
    reqs.map((r) => r.label).join(", "),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildRoleContext(
  role: JobRole,
  reqs: RoleRequirement[],
  prefs: RolePreference[],
  now: Date,
): RoleContext {
  const text = roleText(role, reqs);
  const isAiRole =
    reqs.some((r) => AI_KEYS.has(r.normalizedKey)) || /\b(ai|llm|machine learning|ml)\b/i.test(role.title);
  return {
    role,
    reqs,
    prefs: prefs.filter((p) => p.active),
    text,
    emb: embed(text),
    doc: docInfo(text, now.getUTCFullYear()),
    isAiRole,
    baseWeights: { ...DEFAULT_WEIGHTS, ...(role.scoringOverrides ?? {}) },
    now,
  };
}

function fmtMonth(iso: string | null): string {
  if (!iso) return "Present";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Deterministic profile text for candidates with no resume source (and for the search index). */
export function profileText(c: Candidate): string {
  const lines = [c.fullName, c.headline, [c.city, c.region, c.countryCode].filter(Boolean).join(", ")];
  for (const e of [...c.experiences].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))) {
    lines.push(`${e.title} — ${e.company} (${fmtMonth(e.startDate)} – ${fmtMonth(e.endDate)})`);
    if (e.description) lines.push(e.description);
    for (const b of e.bullets) lines.push(`- ${b}`);
  }
  for (const p of c.projects) lines.push(`Project: ${p.name} — ${p.description}`);
  lines.push(`Skills: ${c.skills.map((s) => s.displayName).join(", ")}`);
  return lines.filter(Boolean).join("\n");
}

export function candidateText(c: Candidate): string {
  const resume = c.sources.find((s) => s.sourceType === "RESUME" && s.text);
  return resume?.text ?? profileText(c);
}

export function buildCandidateContext(c: Candidate, now: Date): CandidateContext {
  const text = candidateText(c);
  const expEmb = new Map<ID, Float32Array>();
  for (const e of c.experiences)
    expEmb.set(e.id, embed(`${e.title} ${e.company}. ${e.description} ${e.bullets.join(" ")}`));
  const projEmb = new Map<ID, Float32Array>();
  for (const p of c.projects) projEmb.set(p.id, embed(`${p.name}. ${p.description}`));
  const nodeEmb = new Map<ID, Float32Array>();
  for (const n of c.evidence) if (n.body.length > 20) nodeEmb.set(n.id, embed(`${n.title}. ${n.body}`));
  return { c, text, emb: embed(text), doc: docInfo(text, now.getUTCFullYear()), expEmb, projEmb, nodeEmb };
}

/** Evidence nodes ranked by semantic relevance to the role — used to ground explanations. */
export function mostRelevantEvidence(
  rc: RoleContext,
  cc: CandidateContext,
  k = 3,
): { id: ID; sim: number }[] {
  return [...cc.nodeEmb.entries()]
    .map(([id, e]) => ({ id, sim: cosine(rc.emb, e) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
}
