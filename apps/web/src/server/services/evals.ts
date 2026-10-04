/**
 * EvalService — offline ranking evaluation over labeled role×candidate pairs (spec §21.2).
 * Every number is computed from labels at run time, using condensed lists (judged candidates only).
 * Recruiter preference deltas are excluded so runs measure the base algorithm version.
 */
import { z } from "zod";
import {
  DEFAULT_RANKING,
  EXPLAINER_VERSION,
  LSA_VERSION,
  RERANKER,
  RERANKER_VERSION,
  SCORE_VERSION,
  buildRoleContext,
  mean,
  ndcgAtK,
  precisionAtK,
  recallAtK,
  reciprocalRank,
  runMatchingPipeline,
  validateCitations,
  type EvalMetrics,
  type EvalRun,
  type RankingConfig,
} from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import { audit, now, requireCap, track, type Actor } from "./core";
import { candidateContext, getIndex } from "./search";
import { clock } from "./matches";
import { enqueue } from "./jobs";

export const EVAL_CONFIGS: RankingConfig[] = [
  {
    label: "Keyword baseline (BM25 only)",
    useKeyword: true,
    useDeterministic: false,
    useSemantic: false,
    useReranker: false,
    blend: { deterministic: 0, semantic: 0, rerank: 0 },
  },
  {
    label: "Deterministic features only",
    useKeyword: true,
    useDeterministic: true,
    useSemantic: false,
    useReranker: false,
    blend: { deterministic: 1, semantic: 0, rerank: 0 },
  },
  {
    label: "Deterministic + semantic",
    useKeyword: true,
    useDeterministic: true,
    useSemantic: true,
    useReranker: false,
    blend: { deterministic: 0.75, semantic: 0.25, rerank: 0 },
  },
  DEFAULT_RANKING,
];

const rerankSchema = z.object({
  relevance: z.number().min(0).max(1),
  probabilities: z
    .tuple([z.number(), z.number(), z.number()])
    .refine((p) => Math.abs(p[0] + p[1] + p[2] - 1) < 0.01),
  confidence: z.number().min(0).max(1),
  reasons: z.array(
    z.object({ text: z.string(), evidenceIds: z.array(z.string()).min(1), impact: z.number() }),
  ),
  recommendation: z.enum(["advance", "consider", "pass"]),
});

export function computeEval(config: RankingConfig, datasetId: string): EvalMetrics {
  const db = getDB();
  const cases = db.evalCases.filter((c) => c.datasetId === datasetId);
  const roleIds = [...new Set(cases.map((c) => c.roleId))];
  const contexts = new Map(db.candidates.map((c) => [c.id, candidateContext(c)]));
  const p5: number[] = [];
  const r10: number[] = [];
  const nd: number[] = [];
  const rr: number[] = [];
  let violations = 0;
  let topSlots = 0;
  let cited = 0;
  let validCited = 0;
  let schemaOk = 0;
  let schemaTotal = 0;
  const latencies: number[] = [];
  const perRole: EvalMetrics["perRole"] = [];
  for (const roleId of roleIds) {
    const role = db.roles.find((r) => r.id === roleId);
    if (!role) continue;
    const rc = buildRoleContext(
      role,
      db.requirements.filter((r) => r.roleId === roleId),
      [],
      clock(),
    );
    const t0 = performance.now();
    const res = runMatchingPipeline(rc, contexts, getIndex(), { config, explain: config.useDeterministic });
    latencies.push(performance.now() - t0);
    const labels = cases.filter((c) => c.roleId === roleId);
    const gains = new Map(labels.map((c) => [c.candidateId, c.expectedRelevance]));
    // Condensed-list evaluation (Sakai, 2007): judgments are incomplete, so metrics are computed
    // over the judged candidates in the order the system ranked them; unjudged ones are skipped.
    const ranked = res.ranked.map((s) => s.candidateId).filter((id) => gains.has(id));
    const relevant = new Set(labels.filter((c) => c.expectedRelevance >= 2).map((c) => c.candidateId));
    if (!relevant.size) continue;
    const n10 = ndcgAtK(ranked, gains, 10);
    const pr5 = precisionAtK(ranked, relevant, 5);
    nd.push(n10);
    p5.push(pr5);
    r10.push(recallAtK(ranked, relevant, 10));
    rr.push(reciprocalRank(ranked, relevant));
    perRole.push({
      roleId,
      title: role.title,
      ndcgAt10: Math.round(n10 * 1000) / 1000,
      precisionAt5: Math.round(pr5 * 1000) / 1000,
    });
    for (const s of res.ranked.slice(0, 10)) {
      topSlots++;
      if (s.hardConstraintStatus === "FAIL") violations++;
      if (s.explanation) {
        const v = validateCitations(s.explanation, contexts.get(s.candidateId)!.c);
        cited += v.total;
        validCited += v.valid;
      }
      if (s.rerank) {
        schemaTotal++;
        if (rerankSchema.safeParse(s.rerank).success) schemaOk++;
      }
    }
  }
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  return {
    precisionAt5: r3(mean(p5)),
    recallAt10: r3(mean(r10)),
    ndcgAt10: r3(mean(nd)),
    mrr: r3(mean(rr)),
    hardConstraintViolationRate: r3(topSlots ? violations / topSlots : 0),
    citationValidity: cited ? r3(validCited / cited) : -1,
    structuredOutputSuccess: schemaTotal ? r3(schemaOk / schemaTotal) : -1,
    hallucinatedEvidenceRate: cited ? r3(1 - validCited / cited) : -1,
    avgLatencyMs: Math.round(mean(latencies) * 10) / 10,
    estimatedCostUsd: 0,
    roles: perRole.length,
    cases: cases.length,
    perRole,
  };
}

export function recordEvalRun(config: RankingConfig, actorUserId: string | null, name?: string): EvalRun {
  const db = getDB();
  const dataset = db.evalDatasets[0]!;
  const run: EvalRun = {
    id: nextId(db, "eval"),
    datasetId: dataset.id,
    name: name ?? config.label,
    codeVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    scoringVersion: SCORE_VERSION,
    promptVersion: EXPLAINER_VERSION,
    modelConfig: config,
    status: "RUNNING",
    startedAt: now().toISOString(),
    completedAt: null,
    metrics: null,
    createdByUserId: actorUserId,
  };
  db.evalRuns.push(run);
  run.metrics = computeEval(config, dataset.id);
  run.status = "COMPLETED";
  run.completedAt = now().toISOString();
  persist();
  return run;
}

export async function runEvalSuite(actor: Actor, config: RankingConfig, name?: string) {
  requireCap(actor, "evals.run");
  const { job } = await enqueue({
    type: "run-eval-suite",
    idempotencyKey: `eval:${JSON.stringify(config)}:${Date.now()}`,
    organizationId: null,
    userId: actor.user.id,
    payload: { config: config.label },
    steps: ["Load labeled dataset", "Rank every labeled role", "Compute metrics"],
    task: async (ctx) => {
      await ctx.step(
        "Load labeled dataset",
        () => getDB().evalCases.length,
        (n) => `${n} labeled role × candidate pairs`,
      );
      const run = await ctx.step(
        "Rank every labeled role",
        () => recordEvalRun(config, actor.user.id, name),
        (r) => `${r.metrics?.roles} roles ranked`,
      );
      await ctx.step(
        "Compute metrics",
        () => run.metrics,
        (m) => `NDCG@10 ${m?.ndcgAt10} · P@5 ${m?.precisionAt5}`,
      );
      audit(actor, "eval.run_completed", "eval_run", run.id, { config: config.label });
      track(actor, "eval_run_completed", { ndcg: run.metrics?.ndcgAt10 ?? 0 });
      return { evalRunId: run.id };
    },
  });
  return job;
}

export function evalOverview() {
  const db = getDB();
  return {
    dataset: db.evalDatasets[0] ?? null,
    cases: db.evalCases.length,
    labelHistogram: [0, 1, 2, 3].map((g) => db.evalCases.filter((c) => c.expectedRelevance === g).length),
    runs: [...db.evalRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    external: {
      model: RERANKER_VERSION,
      embeddings: LSA_VERSION,
      training: RERANKER.training,
      results: RERANKER.testResults,
      selection: RERANKER.modelSelection,
    },
  };
}
