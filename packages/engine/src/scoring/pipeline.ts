/**
 * Role matching pipeline (spec §15.2 / §16):
 *   role → hybrid retrieval (top N) → hard constraints → deterministic features → semantic
 *   → learned rerank of top K only → blend → explanations + counterfactuals for top results.
 * Pure: takes contexts + an index, returns results and per-stage timings for tracing.
 */
import type { MatchExplanation, MatchUncertainty, RankingConfig } from "../types";
import { round } from "../text";
import type { SearchEngine } from "../search/index";
import type { CandidateContext, RoleContext } from "./context";
import { PIPELINE_LIMITS } from "./config";
import { computeRerank, computeSemantic, scoreCandidate, type ScoredCandidate } from "./score";
import { counterfactuals, generateExplanation } from "./explain";

export interface PipelineResult {
  ranked: (ScoredCandidate & {
    retrievalScore: number | null;
    keywordScore: number | null;
    uncertaintiesFull: Omit<MatchUncertainty, "id" | "resolvedAt">[];
    explanation: MatchExplanation | null;
  })[];
  filtered: ScoredCandidate[];
  retrieved: number;
  timings: { stage: string; ms: number; detail: string }[];
}

export interface PipelineOptions {
  config: RankingConfig;
  limits?: Partial<typeof PIPELINE_LIMITS>;
  explain?: boolean;
}

export function roleSearchText(rc: RoleContext): string {
  const skills = rc.reqs.filter((r) => r.category === "SKILL" && r.importance !== "NICE").map((r) => r.label);
  return [rc.role.title.replace(/[-–—].*$/, ""), ...skills].join(" ");
}

export function runMatchingPipeline(
  rc: RoleContext,
  contexts: Map<string, CandidateContext>,
  index: SearchEngine,
  opts: PipelineOptions,
): PipelineResult {
  const limits = { ...PIPELINE_LIMITS, ...(opts.limits ?? {}) };
  const timings: PipelineResult["timings"] = [];
  const clock = () => performance.now();

  // ---- retrieval
  let t = clock();
  const res = index.search({
    text: opts.config.useKeyword ? roleSearchText(rc) : "",
    vector: opts.config.useSemantic || !opts.config.useKeyword ? rc.emb : null,
    limit: limits.retrieveTopN,
    filters: { ids: [...contexts.keys()] },
  });
  timings.push({
    stage: "typesense_retrieval",
    ms: round(clock() - t, 2),
    detail: `${res.mode} retrieval, ${res.hits.length}/${res.found} candidates`,
  });
  const retrieval = new Map(res.hits.map((h) => [h.id, h]));

  // keyword-only baseline: rank purely by retrieval order
  if (!opts.config.useDeterministic) {
    const ranked = res.hits
      .map((h) => {
        const cc = contexts.get(h.id)!;
        const s = scoreCandidate(rc, cc, {
          config: { ...opts.config, useSemantic: false, useReranker: false },
        });
        return {
          ...s,
          final: h.keywordScore ?? h.score,
          retrievalScore: h.score,
          keywordScore: h.keywordScore,
          uncertaintiesFull: [],
          explanation: null,
        };
      })
      .sort((a, b) => b.final - a.final);
    return { ranked, filtered: [], retrieved: res.hits.length, timings };
  }

  // ---- deterministic + semantic scoring (+ constraints)
  t = clock();
  const scored = res.hits.map((h) => {
    const cc = contexts.get(h.id)!;
    const semantic = opts.config.useSemantic ? computeSemantic(rc, cc) : null;
    return scoreCandidate(rc, cc, { config: { ...opts.config, useReranker: false }, semantic });
  });
  timings.push({
    stage: "deterministic_scoring",
    ms: round(clock() - t, 2),
    detail: `${scored.length} candidates × 11 features + ${rc.prefs.length} preferences`,
  });

  const filtered = scored.filter((s) => s.hardConstraintStatus === "FAIL");
  let pool = scored
    .filter((s) => s.hardConstraintStatus !== "FAIL")
    .sort((a, b) => b.final - a.final || a.candidateId.localeCompare(b.candidateId));

  // ---- bounded learned rerank of the top K only
  if (opts.config.useReranker) {
    t = clock();
    const top = pool.slice(0, limits.rerankTopN).map((s) => {
      const cc = contexts.get(s.candidateId)!;
      const rerank = computeRerank(rc, cc);
      return scoreCandidate(rc, cc, { config: opts.config, semantic: s.semantic, rerank });
    });
    // The reranker can only reorder retrieved candidates — it never introduces new ones.
    pool = [...top, ...pool.slice(limits.rerankTopN)].sort(
      (a, b) => b.final - a.final || a.candidateId.localeCompare(b.candidateId),
    );
    timings.push({
      stage: "llm_rerank",
      ms: round(clock() - t, 2),
      detail: `fit-MLP rerank of top ${top.length}`,
    });
  }

  // ---- explanations + counterfactual impact for top results
  t = clock();
  const ranked = pool.map((s, i) => {
    const cc = contexts.get(s.candidateId)!;
    const h = retrieval.get(s.candidateId);
    let uncertaintiesFull: Omit<MatchUncertainty, "id" | "resolvedAt">[] = s.uncertainties.map((u) => ({
      ...u,
      expectedImpact: 0,
    }));
    let explanation: MatchExplanation | null = null;
    if (opts.explain !== false && i < limits.explainTopN) {
      const cfs = counterfactuals(rc, cc, s, s.uncertainties, opts.config);
      uncertaintiesFull = s.uncertainties.map((u) => {
        const cf = cfs.find((x) => x.key === u.key);
        return { ...u, expectedImpact: cf ? round(Math.max(0, cf.finalAfter - cf.finalBefore) / 100, 4) : 0 };
      });
      explanation = generateExplanation(
        rc,
        cc,
        s,
        uncertaintiesFull.map((u, j) => ({ ...u, id: `u${j}`, resolvedAt: null })),
        opts.config,
        cfs,
      );
    }
    return {
      ...s,
      retrievalScore: h?.score ?? null,
      keywordScore: h?.keywordScore ?? null,
      uncertaintiesFull,
      explanation,
    };
  });
  timings.push({
    stage: "explanation",
    ms: round(clock() - t, 2),
    detail: `explanations + counterfactuals for top ${Math.min(limits.explainTopN, ranked.length)}`,
  });
  return { ranked, filtered, retrieved: res.hits.length, timings };
}
