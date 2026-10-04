/** Ranking metrics computed from human/synthetic labels — never invented (spec §21.2). */

/** Fraction of the top-k that are relevant. */
export function precisionAtK(ranked: string[], relevant: Set<string>, k: number): number {
  const top = ranked.slice(0, k);
  if (!top.length) return 0;
  return top.filter((id) => relevant.has(id)).length / Math.min(k, top.length);
}

/** Fraction of all relevant items that appear in the top-k. */
export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (!relevant.size) return 0;
  return ranked.slice(0, k).filter((id) => relevant.has(id)).length / relevant.size;
}

/** NDCG@k with exponential gains (2^rel − 1) over graded relevance (0..3). */
export function ndcgAtK(ranked: string[], gains: Map<string, number>, k: number): number {
  const dcg = (rels: number[]) =>
    rels.slice(0, k).reduce((s, r, i) => s + (2 ** r - 1) / Math.log2(i + 2), 0);
  const actual = dcg(ranked.map((id) => gains.get(id) ?? 0));
  const ideal = dcg([...gains.values()].sort((a, b) => b - a));
  return ideal > 0 ? actual / ideal : 0;
}

/** Reciprocal rank of the first relevant item. */
export function reciprocalRank(ranked: string[], relevant: Set<string>): number {
  const i = ranked.findIndex((id) => relevant.has(id));
  return i === -1 ? 0 : 1 / (i + 1);
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
