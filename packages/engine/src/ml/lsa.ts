/**
 * LSA embedding inference. Model trained from scratch by ml/train.py:
 * TF-IDF (uni+bigrams, sublinear tf, smoothed idf) -> randomized truncated SVD (96 dims).
 */
import model from "./models/lsa.json";
import { terms, tokenize } from "../text";

interface LsaModel {
  version: string;
  dims: number;
  vocab: string[];
  idf: number[];
  scale: number[];
  vectors: string;
  singularValues: number[];
  trainedOn: { dataset: string; split: string; documents: number; chunks: number };
}

const M = model as LsaModel;
export const LSA_VERSION = M.version;
export const LSA_DIMS = M.dims;
export const LSA_INFO = {
  version: M.version,
  dims: M.dims,
  vocabSize: M.vocab.length,
  trainedOn: M.trainedOn,
};

let termIndex: Map<string, number> | null = null;
let termVectors: Float32Array | null = null;

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function load() {
  if (termIndex && termVectors) return;
  termIndex = new Map(M.vocab.map((t, i) => [t, i]));
  const q = new Int8Array(decodeBase64(M.vectors).buffer);
  const tv = new Float32Array(q.length);
  for (let r = 0; r < M.vocab.length; r++) {
    const s = M.scale[r]!;
    for (let d = 0; d < M.dims; d++) tv[r * M.dims + d] = Math.fround(q[r * M.dims + d]! * s);
  }
  termVectors = tv;
}

export type SparseVec = Map<number, number>;

export function tfidfTokens(tokens: string[]): SparseVec {
  load();
  const counts = new Map<number, number>();
  for (const t of terms(tokens)) {
    const i = termIndex!.get(t);
    if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  const vec: SparseVec = new Map();
  let norm = 0;
  for (const [i, n] of counts) {
    const v = (1 + Math.log(n)) * M.idf[i]!;
    vec.set(i, v);
    norm += v * v;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [i, v] of vec) vec.set(i, v / norm);
  return vec;
}

export function tfidf(text: string): SparseVec {
  return tfidfTokens(tokenize(text));
}

export function sparseDot(a: SparseVec, b: SparseVec): number {
  if (a.size > b.size) [a, b] = [b, a];
  let s = 0;
  for (const [i, v] of a) {
    const w = b.get(i);
    if (w !== undefined) s += v * w;
  }
  return s;
}

export function embedVec(vec: SparseVec): Float32Array {
  load();
  const D = M.dims;
  const e = new Float32Array(D);
  for (const [i, v] of vec) {
    const off = i * D;
    for (let d = 0; d < D; d++) e[d]! += v * termVectors![off + d]!;
  }
  let n = 0;
  for (let d = 0; d < D; d++) n += e[d]! * e[d]!;
  n = Math.sqrt(n);
  if (n > 0) for (let d = 0; d < D; d++) e[d]! /= n;
  return e;
}

export function embed(text: string): Float32Array {
  return embedVec(tfidf(text));
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** Map a raw LSA cosine between short passages (typically 0..0.7) into a 0..1 alignment score. */
export function semanticScoreFromCosine(cos: number): number {
  return Math.max(0, Math.min(1, (cos - 0.05) / 0.6));
}

/**
 * Document-level semantic relevance calibration. Fixed linear map chosen from the seeded corpus
 * (top match ≈ 0.75 raw → 1.0, median ≈ 0.45 → 0.53, p90 ≈ 0.2 → 0.13) so the layer spans 0–1 like the others.
 * Monotone: it never changes the order produced by the semantic layer itself.
 */
export function calibrateSemantic(raw: number): number {
  return Math.max(0, Math.min(1, (raw - 0.12) / 0.62));
}

/** Top vocabulary terms for a document, useful for keyword highlights and explanations. */
export function topTerms(text: string, k = 10): string[] {
  load();
  const vec = tfidf(text);
  return [...vec.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, k)
    .map(([i]) => M.vocab[i]!.replace("_", " "));
}
