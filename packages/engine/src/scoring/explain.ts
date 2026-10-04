/**
 * Explainability. Numbers come from deterministic arithmetic over score components; the
 * generator only turns them into language (spec §16.8, §18.4). No component of the text can
 * change a score, and every citation is drawn from the candidate's own evidence graph.
 */
import type {
  Candidate,
  Counterfactual,
  MatchExplanation,
  MatchUncertainty,
  RankingConfig,
  WhyNotItem,
} from "../types";
import { round } from "../text";
import { applyAnswer, favourableAnswer } from "../candidate-utils";
import type { CandidateContext, RoleContext } from "./context";
import { EXPLAINER_VERSION } from "./config";
import { scoreCandidate, type ScoredCandidate } from "./score";
import { embed } from "../ml/lsa";

function blendShares(s: ScoredCandidate, config: RankingConfig) {
  const b = config.blend;
  const den = b.deterministic + (s.semantic !== null ? b.semantic : 0) + (s.rerank ? b.rerank : 0);
  return {
    det: b.deterministic / den,
    sem: s.semantic !== null ? b.semantic / den : 0,
    rer: s.rerank ? b.rerank / den : 0,
  };
}

/**
 * Exact decomposition of (100 − final score) into the points each component left on the table.
 * Items sum to the gap (up to rounding), which the tests assert.
 */
export function whyNotHundred(s: ScoredCandidate, config: RankingConfig): WhyNotItem[] {
  const sh = blendShares(s, config);
  const scale = 1 + s.preferenceTotals.positive;
  const items: WhyNotItem[] = [];
  for (const comp of s.components) {
    let lost: number;
    if (comp.kind === "feature") lost = (comp.weight / scale) * (1 - comp.normalizedValue);
    else if (comp.weight > 0) lost = (comp.weight / scale) * (1 - comp.normalizedValue);
    else lost = -comp.weight * comp.normalizedValue;
    const pts = sh.det * lost * 100;
    if (pts <= 0.0001) continue;
    const constraintUnknown =
      comp.key === "location_fit" &&
      s.constraints.some((c) => c.key === "location" && c.status === "UNKNOWN");
    const kind: WhyNotItem["kind"] = constraintUnknown
      ? "constraint_unknown"
      : comp.status === "unknown" || (comp.status === "partial" && comp.missing.length > 0)
        ? "missing_evidence"
        : "negative_evidence";
    const why = comp.missing.length ? `Missing: ${comp.missing.slice(0, 3).join("; ")}.` : comp.explanation;
    items.push({ key: comp.key, label: comp.label, pointsLost: round(pts, 2), kind, text: why });
  }
  if (s.semantic !== null && sh.sem > 0) {
    items.push({
      key: "semantic",
      label: "Semantic relevance",
      pointsLost: round(sh.sem * (1 - s.semantic) * 100, 2),
      kind: "semantic",
      text: "Parts of the role's responsibilities have no closely matching passage in the candidate's history.",
    });
  }
  if (s.rerank && sh.rer > 0) {
    items.push({
      key: "rerank",
      label: "Learned reranker",
      pointsLost: round(sh.rer * (1 - s.rerank.relevance) * 100, 2),
      kind: "model_judgement",
      text: `The fit model estimates P(good fit) = ${Math.round(s.rerank.probabilities[2] * 100)}%, P(potential) = ${Math.round(s.rerank.probabilities[1] * 100)}%.`,
    });
  }
  if (s.hardConstraintStatus === "FAIL") {
    const pre = s.final * 2;
    items.push({
      key: "constraint_fail",
      label: "Hard constraint failed",
      pointsLost: round((pre - s.final) * 100, 2),
      kind: "negative_evidence",
      text: s.constraints
        .filter((c) => c.status === "FAIL")
        .map((c) => c.detail)
        .join(" "),
    });
  }
  return items.sort((a, b) => b.pointsLost - a.pointsLost);
}

/**
 * "What would change the score?" — resolve each open uncertainty favourably on a COPY of the
 * candidate, re-run the deterministic scorer and report concrete deltas.
 */
export function counterfactuals(
  rc: RoleContext,
  cc: CandidateContext,
  base: ScoredCandidate,
  uncertainties: Omit<MatchUncertainty, "id" | "expectedImpact" | "resolvedAt">[],
  config: RankingConfig,
): Counterfactual[] {
  let n = 0;
  const newId = (p: string) => `cf_${p}_${n++}`;
  const out: Counterfactual[] = [];
  for (const u of uncertainties) {
    const value = favourableAnswer(u.key, rc.role, u.choices);
    const verified = u.key.startsWith("skill:");
    const { candidate } = applyAnswer(cc.c, rc.role, u.key, value, { now: rc.now, newId, verified });
    const after = scoreCandidate(rc, withCandidate(cc, candidate), {
      config,
      semantic: base.semantic,
      rerank: base.rerank,
    });
    const deltas = after.components
      .map((comp) => {
        const before = base.components.find((x) => x.key === comp.key);
        return {
          key: comp.key,
          label: comp.label,
          delta: round(comp.normalizedValue - (before?.normalizedValue ?? 0), 3),
        };
      })
      .filter((d) => Math.abs(d.delta) >= 0.005);
    out.push({
      key: u.key,
      scenario: scenarioText(u.key, rc, verified),
      componentDeltas: deltas,
      confidenceDelta: round(after.confidence - base.confidence, 3),
      finalBefore: round(base.final * 100, 1),
      finalAfter: round(after.final * 100, 1),
    });
  }
  return out.sort((a, b) => b.finalAfter - b.finalBefore - (a.finalAfter - a.finalBefore));
}

function scenarioText(key: string, rc: RoleContext, verified: boolean): string {
  if (key === "constraint:location")
    return `If the candidate confirms they'll work ${rc.role.locationMode === "HYBRID" ? "hybrid" : "onsite"} in ${rc.role.city}`;
  if (key === "constraint:work_authorization") return "If the candidate confirms work authorization";
  if (key === "constraint:compensation") return "If salary expectations land mid-range";
  if (key.startsWith("skill:"))
    return `If production ${rc.reqs.find((r) => r.normalizedKey === key.slice(6))?.label ?? key.slice(6)} experience becomes ${verified ? "verified" : "confirmed"}`;
  if (key === "pref:team_size") return `If the candidate wants a team of ~${rc.role.teamSize}`;
  if (key === "pref:stage") return `If the candidate is open to a ${rc.role.companyStage} company`;
  if (key === "pref:ai_work") return "If the candidate wants to focus on AI products";
  if (key === "availability") return "If the candidate can start soon";
  if (key.startsWith("conflict:")) return "If the conflicting sources are resolved";
  return key;
}

/** Re-use expensive embeddings when only structured fields / new answer nodes changed. */
export function withCandidate(cc: CandidateContext, c: Candidate): CandidateContext {
  const nodeEmb = new Map(cc.nodeEmb);
  for (const n of c.evidence)
    if (!nodeEmb.has(n.id) && n.body.length > 20) nodeEmb.set(n.id, embed(`${n.title}. ${n.body}`));
  return { ...cc, c, nodeEmb };
}

function band(final: number): string {
  if (final >= 0.88) return "exceptional";
  if (final >= 0.78) return "strong";
  if (final >= 0.66) return "solid";
  if (final >= 0.5) return "partial";
  return "weak";
}

export function generateExplanation(
  rc: RoleContext,
  cc: CandidateContext,
  s: ScoredCandidate,
  uncertainties: MatchUncertainty[],
  config: RankingConfig,
  cfs: Counterfactual[],
): MatchExplanation {
  const c = cc.c;
  const first = c.fullName.split(" ")[0];
  const feats = s.components.filter((x) => x.kind === "feature" && x.weight > 0);
  const strengths = [...feats]
    .filter((f) => f.normalizedValue >= 0.6 && f.evidenceIds.length > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);
  const whyMatch = strengths.map((f) => ({
    text: `${f.label}: ${f.explanation}`,
    evidenceIds: f.evidenceIds.slice(0, 3),
  }));
  if (s.rerank?.reasons[0])
    whyMatch.push({
      text: `Fit model: ${s.rerank.reasons[0].text} (+${(s.rerank.reasons[0].impact * 100).toFixed(1)} relevance pts).`,
      evidenceIds: s.rerank.reasons[0].evidenceIds,
    });

  const risks: MatchExplanation["risks"] = [];
  for (const k of s.constraints.filter((x) => x.status !== "PASS"))
    risks.push({ text: k.detail, evidenceIds: [], kind: k.status === "FAIL" ? "negative" : "missing" });
  for (const f of [...feats].sort((a, b) => a.normalizedValue * a.weight - b.normalizedValue * b.weight)) {
    if (risks.length >= 4) break;
    if (f.normalizedValue >= 0.55) continue;
    risks.push({
      text: `${f.label}: ${f.missing.length ? `missing ${f.missing.slice(0, 2).join(", ")}` : f.explanation}`,
      evidenceIds: f.evidenceIds.slice(0, 2),
      kind: f.status === "known" ? "negative" : "missing",
    });
  }
  for (const cl of c.claims.filter((x) => x.status === "CONFLICTED")) {
    const ids = c.claimLinks.filter((l) => l.claimId === cl.id).map((l) => l.evidenceNodeId);
    risks.push({ text: `Conflicting sources on ${cl.claimValue}.`, evidenceIds: ids, kind: "conflict" });
  }

  const topU = [...uncertainties].sort((a, b) => b.expectedImpact - a.expectedImpact)[0];
  const pts = Math.round(s.final * 100);
  const reasonText = strengths
    .slice(0, 2)
    .map((f) => f.label.toLowerCase())
    .join(" and ");
  const summary =
    `${first} is ${band(s.final) === "exceptional" ? "an" : "a"} ${band(s.final)} match (${pts}/100)` +
    (reasonText ? `, driven by ${reasonText}` : "") +
    `. Confidence ${Math.round(s.confidence * 100)}%.` +
    (topU
      ? ` Biggest open question: ${topU.description.replace(/\.$/, "")}${topU.expectedImpact > 0 ? ` (worth up to +${(topU.expectedImpact * 100).toFixed(1)} pts)` : ""}.`
      : "");

  return {
    summary,
    whyMatch,
    risks: risks.slice(0, 5),
    whyNotHundred: whyNotHundred(s, config),
    counterfactuals: cfs,
    generator: "deterministic-template",
    promptVersion: EXPLAINER_VERSION,
    generatedAt: rc.now.toISOString(),
  };
}

/** Explanation citation validity — every cited ID must exist in the candidate's evidence graph. */
export function validateCitations(expl: MatchExplanation, c: Candidate): { total: number; valid: number } {
  const ids = new Set(c.evidence.map((n) => n.id));
  const cited = [...expl.whyMatch.flatMap((w) => w.evidenceIds), ...expl.risks.flatMap((r) => r.evidenceIds)];
  return { total: cited.length, valid: cited.filter((id) => ids.has(id)).length };
}
