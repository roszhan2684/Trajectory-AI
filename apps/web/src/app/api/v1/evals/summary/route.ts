import { apiActor, handle } from "@/server/http";
import { evalOverview } from "@/server/services/evals";

export async function GET(req: Request) {
  return handle(async () => {
    await apiActor(req);
    const o = evalOverview();
    return {
      dataset: o.dataset && { name: o.dataset.name, version: o.dataset.version, cases: o.cases },
      runs: o.runs.slice(0, 6).map((r) => ({
        name: r.name,
        scoringVersion: r.scoringVersion,
        completedAt: r.completedAt,
        metrics: r.metrics && {
          ndcgAt10: r.metrics.ndcgAt10,
          precisionAt5: r.metrics.precisionAt5,
          recallAt10: r.metrics.recallAt10,
          mrr: r.metrics.mrr,
          hardConstraintViolationRate: r.metrics.hardConstraintViolationRate,
        },
      })),
      externalBenchmark: {
        model: o.external.model,
        test: o.external.results.mlp,
        baselineTfidf: o.external.results.tfidfCosine,
        note: "Held-out test split of cnamuangtoun/resume-job-description-fit (no job descriptions shared with training).",
      },
    };
  });
}
