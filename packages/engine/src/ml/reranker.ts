/**
 * Learned fit reranker (Layer D). A 2-layer MLP trained from scratch in ml/train.py on 6k labeled
 * resume/JD pairs. It replaces the LLM reranker from the build spec: bounded (top-N only),
 * deterministic, and explainable via feature occlusion.
 */
import model from "./models/reranker.json";
import { SKILL_BY_KEY, extractSkills, tokenize, yearsExperienceFromText, yearsRequired } from "../text";
import { cosine, embedVec, sparseDot, tfidfTokens, type SparseVec } from "./lsa";

interface RerankerModel {
  version: string;
  labels: string[];
  embeddingScale: number;
  scalarFeatures: string[];
  scalarMean: number[];
  scalarStd: number[];
  hidden: number;
  interactionDims: number;
  passageTokens: number;
  keyTerms: number;
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
  presentYearForTraining: number;
  training: Record<string, unknown> & {
    curve: { epoch: number; trainLoss: number; valLoss: number; valAccuracy: number }[];
  };
  testResults: Record<string, Record<string, unknown>>;
  modelSelection: {
    hidden: number;
    l2: number;
    interactions: boolean;
    valNdcg10: number;
    valMacroF1: number;
  }[];
}

export const RERANKER = model as unknown as RerankerModel;
export const RERANKER_VERSION = RERANKER.version;

export const SCALAR_LABELS: Record<string, string> = {
  tfidf_cosine: "Keyword overlap (TF-IDF)",
  lsa_cosine: "Overall semantic similarity",
  best_passage_cosine: "Most relevant single passage",
  top3_passage_cosine: "Depth of relevant experience",
  key_term_coverage: "Coverage of the role's key terms",
  skill_coverage: "Required skills covered",
  skill_precision: "Skill focus",
  category_coverage: "Skill-area coverage",
  log_role_skills: "Role skill breadth",
  log_candidate_skills: "Candidate skill breadth",
  years_gap: "Experience vs. years required",
  has_years_requirement: "Role states years required",
};

export interface DocInfo {
  vec: SparseVec;
  emb: Float32Array;
  passages: Float32Array[];
  passageText: string[];
  top: [number, number][];
  skills: Set<string>;
  yearsReq: number | null;
  yearsExp: number;
}

export function docInfo(text: string, presentYear: number): DocInfo {
  const toks = tokenize(text);
  const vec = tfidfTokens(toks);
  const passages: Float32Array[] = [];
  const passageText: string[] = [];
  const P = RERANKER.passageTokens;
  for (let i = 0; i < Math.max(1, toks.length); i += P) {
    const seg = toks.slice(i, i + P);
    if (seg.length >= 8 || i === 0) {
      const pv = tfidfTokens(seg);
      if (pv.size) {
        passages.push(embedVec(pv));
        passageText.push(seg.join(" "));
      }
    }
  }
  const top = [...vec.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, RERANKER.keyTerms);
  return {
    vec,
    emb: embedVec(vec),
    passages,
    passageText,
    top,
    skills: extractSkills(text),
    yearsReq: yearsRequired(text),
    yearsExp: yearsExperienceFromText(text, presentYear),
  };
}

export interface PairFeatures {
  interactions: number[];
  scalars: number[];
}

export function pairFeatures(role: DocInfo, cand: DocInfo): PairFeatures {
  const inter = [...role.skills].filter((s) => cand.skills.has(s));
  const rcat = new Set([...role.skills].map((s) => SKILL_BY_KEY[s]!.category));
  const ccat = new Set([...cand.skills].map((s) => SKILL_BY_KEY[s]!.category));
  const catInter = [...rcat].filter((c) => ccat.has(c)).length;
  const pc = (cand.passages.length ? cand.passages.map((p) => cosine(p, role.emb)) : [0]).sort(
    (a, b) => b - a,
  );
  const tw = role.top.reduce((s, [, w]) => s + w, 0) || 1;
  const covered = role.top.reduce((s, [i, w]) => s + (cand.vec.has(i) ? w : 0), 0);
  const yr = role.yearsReq;
  const top3 = pc.slice(0, 3);
  const scalars = [
    sparseDot(role.vec, cand.vec),
    cosine(role.emb, cand.emb),
    pc[0]!,
    top3.reduce((a, b) => a + b, 0) / top3.length,
    covered / tw,
    inter.length / Math.max(1, role.skills.size),
    inter.length / Math.max(1, cand.skills.size),
    catInter / Math.max(1, rcat.size),
    Math.log1p(role.skills.size),
    Math.log1p(cand.skills.size),
    yr !== null ? Math.max(-2, Math.min(2, (cand.yearsExp - yr) / 5)) : 0,
    yr !== null ? 1 : 0,
  ];
  const k = RERANKER.interactionDims;
  const interactions: number[] = [];
  for (let d = 0; d < k; d++) interactions.push(role.emb[d]! * cand.emb[d]!);
  return { interactions, scalars };
}

function inputVector(f: PairFeatures): number[] {
  const x: number[] = f.interactions.map((v) => v * RERANKER.embeddingScale);
  f.scalars.forEach((v, i) => x.push((v - RERANKER.scalarMean[i]!) / RERANKER.scalarStd[i]!));
  return x;
}

function forward(x: number[]): [number, number, number] {
  const H = RERANKER.hidden;
  const h = new Array<number>(H).fill(0);
  for (let j = 0; j < H; j++) {
    let z = RERANKER.b1[j]!;
    for (let i = 0; i < x.length; i++) z += x[i]! * RERANKER.W1[i]![j]!;
    h[j] = z > 0 ? z : 0;
  }
  const logits = [0, 1, 2].map((c) => {
    let z = RERANKER.b2[c]!;
    for (let j = 0; j < H; j++) z += h[j]! * RERANKER.W2[j]![c]!;
    return z;
  });
  const mx = Math.max(...logits);
  const e = logits.map((z) => Math.exp(z - mx));
  const s = e[0]! + e[1]! + e[2]!;
  return [e[0]! / s, e[1]! / s, e[2]! / s];
}

export function predictProbabilities(f: PairFeatures): [number, number, number] {
  return forward(inputVector(f));
}

export function relevanceFromProbs(p: [number, number, number]): number {
  return p[2] + 0.5 * p[1];
}

/**
 * Logistic score calibration (center 0.48, temperature 0.09). The fit model was trained on noisy
 * labels, so its expected relevance clusters in ~0.3–0.75; this monotone map spreads it over 0–1
 * before blending. Raw probabilities are always kept alongside for transparency.
 */
export const RERANK_CALIBRATION = { center: 0.48, temperature: 0.09 };
export function calibrateRerank(raw: number): number {
  return 1 / (1 + Math.exp(-(raw - RERANK_CALIBRATION.center) / RERANK_CALIBRATION.temperature));
}

/**
 * Occlusion attribution: reset one standardized scalar feature to the training mean (0) and
 * measure the change in relevance. Positive = the feature pushed this pair UP.
 */
export function attributions(
  f: PairFeatures,
): { feature: string; label: string; impact: number; value: number }[] {
  const x = inputVector(f);
  const base = relevanceFromProbs(forward(x));
  const off = f.interactions.length;
  return RERANKER.scalarFeatures.map((name, i) => {
    const xo = x.slice();
    xo[off + i] = 0;
    return {
      feature: name,
      label: SCALAR_LABELS[name] ?? name,
      impact: base - relevanceFromProbs(forward(xo)),
      value: f.scalars[i]!,
    };
  });
}
