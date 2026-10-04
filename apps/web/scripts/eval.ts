/**
 * pnpm eval [-- --min-ndcg 0.80]
 * CI-friendly offline eval: builds the deterministic dataset in memory, runs every pipeline
 * configuration against the labeled pairs, prints metrics and gates on the full pipeline's NDCG@10.
 * Calls no paid models, so it is safe to run on every PR.
 */
import { buildSeed } from "../src/server/seed/build";
import { EVAL_CONFIGS, computeEval } from "../src/server/services/evals";
import { getDB } from "../src/server/db/store";
import { RERANKER } from "@trajectory/engine";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const minNdcg = Number(arg("--min-ndcg") ?? 0);

await buildSeed();
const ds = getDB().evalDatasets[0]!;
const rows = EVAL_CONFIGS.map((c) => ({ config: c.label, ...computeEval(c, ds.id) }));
console.log(`\nDataset: ${ds.name} (${getDB().evalCases.length} labeled pairs)\n`);
console.table(
  rows.map((r) => ({
    config: r.config.replace(" (deterministic + semantic + learned reranker)", ""),
    "NDCG@10": r.ndcgAt10,
    "P@5": r.precisionAt5,
    "R@10": r.recallAt10,
    MRR: r.mrr,
    "constraint viol.": r.hardConstraintViolationRate,
    "citation validity": r.citationValidity,
    "latency ms": r.avgLatencyMs,
  })),
);
const ext = RERANKER.testResults as Record<string, Record<string, number>>;
console.log(
  `External benchmark (held-out public test set): fit-MLP NDCG@10 ${ext.mlp!.ndcg10} vs TF-IDF ${ext.tfidfCosine!.ndcg10}; macro-F1 ${ext.mlp!.macroF1}\n`,
);
const full = rows[rows.length - 1]!;
if (full.ndcgAt10 < minNdcg) {
  console.error(`✗ Full pipeline NDCG@10 ${full.ndcgAt10} is below the gate ${minNdcg}`);
  process.exit(1);
}
if (full.hardConstraintViolationRate > 0) {
  console.error("✗ Full pipeline surfaced a candidate that fails a hard constraint");
  process.exit(1);
}
console.log(`✓ Eval gate passed (NDCG@10 ${full.ndcgAt10} ≥ ${minNdcg}, 0 constraint violations)`);
