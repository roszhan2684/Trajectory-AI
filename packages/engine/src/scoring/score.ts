/**
 * Score assembly: Layer B features + allowlisted recruiter preferences + Layer C semantic +
 * Layer D learned reranker, then hard-constraint policy and a separately calibrated confidence.
 */
import type {
  ConstraintCheck,
  ConstraintStatus,
  FeatureKey,
  MatchUncertainty,
  RankingConfig,
  RerankResult,
  ScoreComponent,
} from "../types";
import { clamp, round } from "../text";
import { calibrateSemantic, cosine, topTerms } from "../ml/lsa";
import {
  RERANKER_VERSION,
  attributions,
  calibrateRerank,
  pairFeatures,
  predictProbabilities,
  relevanceFromProbs,
} from "../ml/reranker";
import { MAX_PREFERENCE_DELTA, PREFERENCE_BY_KEY } from "../preferences";
import { aggregateConstraintStatus, evaluateConstraints } from "./constraints";
import { computeFeatures, type FeatureResult, type SkillSupport, type Trajectory } from "./features";
import { mostRelevantEvidence, type CandidateContext, type RoleContext } from "./context";

export interface ScoredCandidate {
  candidateId: string;
  deterministic: number;
  semantic: number | null;
  rerank: RerankResult | null;
  final: number;
  confidence: number;
  constraints: ConstraintCheck[];
  hardConstraintStatus: ConstraintStatus;
  components: ScoreComponent[];
  features: FeatureResult[];
  skills: (SkillSupport & { req: { label: string; importance: string; normalizedKey: string } })[];
  trajectory: Trajectory;
  uncertainties: Omit<MatchUncertainty, "id" | "expectedImpact" | "resolvedAt">[];
  preferenceTotals: { positive: number; negative: number };
}

/** Effective feature weights: base config, non-applicable features removed, renormalized to 1. */
export function effectiveWeights(rc: RoleContext, features: FeatureResult[]): Record<FeatureKey, number> {
  const w = { ...rc.baseWeights };
  let sum = 0;
  for (const f of features) {
    if (!f.applicable) w[f.key] = 0;
    sum += w[f.key];
  }
  for (const f of features) w[f.key] = sum > 0 ? w[f.key] / sum : 0;
  return w;
}

/** Collapse active preferences into one bounded delta per allowlisted key. */
export function preferenceDeltas(rc: RoleContext): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of rc.prefs) {
    if (!PREFERENCE_BY_KEY[p.key]) continue; // never rank on non-allowlisted keys
    m.set(p.key, (m.get(p.key) ?? 0) + p.weightDelta);
  }
  for (const [k, v] of m) m.set(k, clamp(v, -MAX_PREFERENCE_DELTA, MAX_PREFERENCE_DELTA));
  return m;
}

export function computeSemantic(rc: RoleContext, cc: CandidateContext): number {
  const doc = cosine(rc.emb, cc.emb);
  const best = cc.doc.passages.length ? Math.max(...cc.doc.passages.map((p) => cosine(p, rc.emb))) : doc;
  return round(calibrateSemantic(0.5 * doc + 0.5 * best), 4);
}

export function computeRerank(rc: RoleContext, cc: CandidateContext): RerankResult {
  const f = pairFeatures(rc.doc, cc.doc);
  const probs = predictProbabilities(f);
  const relevance = relevanceFromProbs(probs);
  const attr = attributions(f).sort((a, b) => b.impact - a.impact);
  const c = cc.c;
  const relevantNodes = mostRelevantEvidence(rc, cc, 2).map((x) => x.id);
  const roleTerms = topTerms(rc.text, 12);
  const termNodes = c.evidence
    .filter((n) => n.type !== "PROFILE_FIELD" && roleTerms.some((t) => n.body.toLowerCase().includes(t)))
    .slice(0, 2)
    .map((n) => n.id);
  const sharedSkills = [...rc.doc.skills].filter((s) => cc.doc.skills.has(s));
  const skillNodeIds = c.evidence
    .filter((n) => n.skills.some((s) => sharedSkills.includes(s)) && n.type !== "PROFILE_FIELD")
    .slice(0, 3)
    .map((n) => n.id);
  const expNodes = c.evidence
    .filter((n) => n.type === "EXPERIENCE")
    .slice(0, 2)
    .map((n) => n.id);
  const evidenceFor = (feature: string) =>
    feature.includes("passage") || feature === "lsa_cosine"
      ? relevantNodes
      : feature === "key_term_coverage" || feature === "tfidf_cosine"
        ? termNodes.length
          ? termNodes
          : relevantNodes
        : feature.includes("skill") || feature === "category_coverage"
          ? skillNodeIds
          : expNodes;
  const reasons = attr
    .filter((a) => a.impact > 0.004)
    .slice(0, 3)
    .map((a) => ({
      text: `${a.label} raised the model's fit estimate`,
      evidenceIds: evidenceFor(a.feature),
      impact: round(a.impact, 4),
    }))
    .filter((r) => r.evidenceIds.length > 0);
  const missingInformation = [...rc.doc.skills].filter((s) => !cc.doc.skills.has(s)).slice(0, 4);
  return {
    relevance: round(calibrateRerank(relevance), 4),
    rawRelevance: round(relevance, 4),
    probabilities: [round(probs[0], 4), round(probs[1], 4), round(probs[2], 4)],
    confidence: round(Math.max(...probs), 4),
    reasons,
    missingInformation,
    recommendation: relevance >= 0.6 ? "advance" : relevance >= 0.42 ? "consider" : "pass",
    modelVersion: RERANKER_VERSION,
  };
}

export interface ScoreOptions {
  config: RankingConfig;
  rerank?: RerankResult | null;
  semantic?: number | null;
}

export function scoreCandidate(rc: RoleContext, cc: CandidateContext, opts: ScoreOptions): ScoredCandidate {
  const c = cc.c;
  const { features, skills, trajectory } = computeFeatures(rc, cc);
  const weights = effectiveWeights(rc, features);
  const deltas = preferenceDeltas(rc);
  const positive = [...deltas.values()].filter((d) => d > 0).reduce((s, d) => s + d, 0);
  const negative = [...deltas.values()].filter((d) => d < 0).reduce((s, d) => s - d, 0);
  const scale = 1 + positive;

  const components: ScoreComponent[] = features.map((f) => ({
    key: f.key,
    label: f.label,
    kind: "feature",
    rawValue: f.rawValue,
    normalizedValue: f.normalizedValue,
    weight: round(weights[f.key], 4),
    contribution: round((weights[f.key] * f.normalizedValue) / scale, 5),
    status: f.applicable ? f.status : "known",
    evidenceIds: f.evidenceIds,
    explanation: f.explanation,
    missing: f.missing,
  }));
  for (const [key, delta] of deltas) {
    const pf = PREFERENCE_BY_KEY[key]!;
    const v = pf.extract(c, rc.now);
    components.push({
      key: `pref:${key}`,
      label: pf.label,
      kind: "preference",
      rawValue: v.detail,
      normalizedValue: round(v.value, 4),
      weight: round(delta, 4),
      contribution: round(delta > 0 ? (delta * v.value) / scale : delta * v.value, 5),
      status: "known",
      evidenceIds: v.evidenceIds,
      explanation: `${delta > 0 ? "Boosted" : "Down-weighted"} by recruiter feedback: ${v.detail}.`,
      missing: [],
    });
  }
  const deterministic = round(clamp(components.reduce((s, x) => s + x.contribution, 0)), 4);

  const semantic = opts.config.useSemantic ? (opts.semantic ?? computeSemantic(rc, cc)) : null;
  const rerank = opts.config.useReranker ? (opts.rerank ?? null) : null;
  const b = opts.config.blend;
  let num = b.deterministic * deterministic;
  let den = b.deterministic;
  if (semantic !== null) {
    num += b.semantic * semantic;
    den += b.semantic;
  }
  if (rerank) {
    num += b.rerank * rerank.relevance;
    den += b.rerank;
  }
  const constraints = evaluateConstraints(rc.role, rc.reqs, c);
  const hardConstraintStatus = aggregateConstraintStatus(constraints);
  let final = den > 0 ? num / den : 0;
  if (hardConstraintStatus === "FAIL") final *= 0.5; // policy: failing candidates are filtered and visibly penalized

  const uncertainties = buildUncertainties(rc, skills, constraints, c);
  const confidence = computeConfidence(rc, cc, features, constraints, skills);

  return {
    candidateId: c.id,
    deterministic,
    semantic,
    rerank,
    final: round(final, 4),
    confidence,
    constraints,
    hardConstraintStatus,
    components,
    features,
    skills,
    trajectory,
    uncertainties,
    preferenceTotals: { positive, negative },
  };
}

/** Confidence is distinct from fit (spec §16.7): how much should we trust this score? */
export function computeConfidence(
  rc: RoleContext,
  cc: CandidateContext,
  features: FeatureResult[],
  constraints: ConstraintCheck[],
  skills: SkillSupport[],
): number {
  const c = cc.c;
  let conf = 0.42;
  conf += 0.14 * c.profileCompleteness;
  const dated = c.evidence.filter((n) => n.observedAt);
  const recent = dated.filter(
    (n) => (rc.now.getTime() - new Date(n.observedAt!).getTime()) / 3.15e10 <= 3,
  ).length;
  conf += dated.length ? 0.1 * (recent / dated.length) : 0;
  const multi = skills.filter((s) => s.status === "supported").length;
  conf += skills.length ? 0.16 * (multi / skills.length) : 0.05;
  const answered = c.evidence.filter((n) => n.type === "ANSWER").length;
  conf += Math.min(0.1, answered * 0.04);
  conf += Math.min(0.06, c.evidence.filter((n) => n.verified).length * 0.015);
  conf -= 0.09 * constraints.filter((x) => x.status === "UNKNOWN" && !x.soft).length;
  conf -= 0.03 * constraints.filter((x) => x.status === "UNKNOWN" && x.soft).length;
  conf -= 0.035 * features.filter((f) => f.applicable && f.status === "unknown").length;
  conf -= 0.06 * c.claims.filter((cl) => cl.status === "CONFLICTED").length;
  conf -= 0.03 * (rc.role.parse?.ambiguities.filter((a) => a.severity !== "low").length ?? 0);
  return round(clamp(conf, 0.05, 0.97), 4);
}

const PREF_QUESTIONS = {
  team_size: (n: number) => `Would you be excited to join a team of around ${n} people?`,
  stage: (s: string) => `Are you open to joining a ${s.replace("-", " ")} company?`,
  ai_work: () => "Do you want your next role to focus on building AI/LLM products?",
};

function buildUncertainties(
  rc: RoleContext,
  skills: (SkillSupport & { req: { label: string; importance: string; normalizedKey: string } })[],
  constraints: ConstraintCheck[],
  c: CandidateContext["c"],
): ScoredCandidate["uncertainties"] {
  const out: ScoredCandidate["uncertainties"] = [];
  for (const k of constraints.filter((x) => x.status === "UNKNOWN")) {
    out.push({
      key: `constraint:${k.key}`,
      severity: k.soft ? "low" : "high",
      description: k.detail,
      resolutionQuestion:
        k.key === "compensation" ? "What base salary range are you targeting (USD)?" : k.resolutionQuestion,
      answerKind: k.key === "compensation" ? "number" : k.key === "work_authorization" ? "choice" : "yes_no",
      choices:
        k.key === "work_authorization"
          ? ["Authorized — no sponsorship needed", "I will need visa sponsorship"]
          : null,
    });
  }
  for (const s of skills) {
    if (s.status === "missing" || s.status === "inferred" || s.status === "adjacent") {
      out.push({
        key: `skill:${s.req.normalizedKey}`,
        severity: s.req.importance === "MUST" ? "medium" : "low",
        description:
          s.status === "adjacent"
            ? `${s.req.label}: no direct evidence, but adjacent experience with ${s.via}.`
            : s.status === "inferred"
              ? `${s.req.label}: listed on profile but not demonstrated in any role or project.`
              : `${s.req.label}: no evidence on profile (missing ≠ negative).`,
        resolutionQuestion: `Have you used ${s.req.label} in production? If so, where?`,
        answerKind: "yes_no",
        choices: null,
      });
    }
  }
  const p = c.preferences;
  if (rc.role.teamSize !== null && p.minTeamSize === null && p.maxTeamSize === null) {
    out.push({
      key: "pref:team_size",
      severity: "low",
      description: "Unknown whether the candidate wants a team this size.",
      resolutionQuestion: PREF_QUESTIONS.team_size(rc.role.teamSize),
      answerKind: "yes_no",
      choices: null,
    });
  }
  if (p.desiredStages === null) {
    out.push({
      key: "pref:stage",
      severity: "low",
      description: `Unknown whether the candidate wants a ${rc.role.companyStage} company.`,
      resolutionQuestion: PREF_QUESTIONS.stage(rc.role.companyStage),
      answerKind: "yes_no",
      choices: null,
    });
  }
  if (rc.isAiRole && p.wantsAiWork === null) {
    out.push({
      key: "pref:ai_work",
      severity: "low",
      description: "Unknown whether the candidate wants to focus on AI products.",
      resolutionQuestion: PREF_QUESTIONS.ai_work(),
      answerKind: "yes_no",
      choices: null,
    });
  }
  if (c.availability === null) {
    out.push({
      key: "availability",
      severity: "low",
      description: "Availability / notice period unknown.",
      resolutionQuestion: "When could you realistically start a new role?",
      answerKind: "choice",
      choices: [
        "Immediately",
        "In 2 weeks",
        "In about a month",
        "In about 3 months",
        "Not looking right now",
      ],
    });
  }
  for (const cl of c.claims.filter((x) => x.status === "CONFLICTED")) {
    const alts = (cl.claimValue.split(" vs ").length > 1 ? cl.claimValue.split(" vs ") : [cl.claimValue]).map(
      (s) => s.trim(),
    );
    out.push({
      key: `conflict:${cl.id}`,
      severity: "medium",
      description: `Conflicting sources: ${cl.claimValue}.`,
      resolutionQuestion: `Your sources disagree (${cl.claimValue}). Which is accurate?`,
      answerKind: "choice",
      choices: alts,
    });
  }
  return out;
}
