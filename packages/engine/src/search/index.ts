/**
 * LocalHybridIndex — an in-process implementation of the SearchEngine interface.
 * Mirrors Typesense semantics: BM25-style keyword relevance over weighted fields, filters/facets,
 * vector (cosine) retrieval, and rank fusion:  (1-α)·1/(1+kwRank) + α·1/(1+vecRank).
 * A TypesenseSearchEngine adapter would implement the same interface against candidates_v1.
 */
import { terms, tokenize } from "../text";
import type { SearchDocument } from "./document";

export interface SearchFilters {
  skills?: string[];
  metros?: string[];
  stages?: string[];
  minYears?: number | null;
  maxYears?: number | null;
  workModes?: string[];
  excludeNeedsSponsorship?: boolean;
  countryCodes?: string[];
  ids?: string[];
}

export interface SearchQuery {
  text: string;
  vector?: number[] | Float32Array | null;
  filters?: SearchFilters;
  alpha?: number; // weight of vector rank in fusion (Typesense default 0.3)
  limit?: number;
  offset?: number;
  facetBy?: (keyof Pick<
    SearchDocument,
    "skills" | "metro" | "company_stages" | "work_modes" | "visa_needs"
  >)[];
}

export interface SearchHit {
  id: string;
  score: number;
  keywordScore: number | null; // normalized 0..1 within result set
  vectorScore: number | null; // cosine
  keywordRank: number | null;
  vectorRank: number | null;
  highlight: { field: string; snippet: string; matches: [number, number][] } | null;
}

export interface SearchResult {
  hits: SearchHit[];
  found: number;
  facets: Record<string, { value: string; count: number }[]>;
  tookMs: number;
  mode: "hybrid" | "keyword" | "vector" | "browse";
}

export interface SearchEngine {
  readonly name: string;
  upsert(doc: SearchDocument): void;
  remove(id: string): void;
  get(id: string): SearchDocument | undefined;
  size(): number;
  search(q: SearchQuery): SearchResult;
}

const FIELDS: { name: keyof SearchDocument; weight: number }[] = [
  { name: "skill_names", weight: 3 },
  { name: "current_title", weight: 2.2 },
  { name: "headline", weight: 2 },
  { name: "full_name", weight: 1.5 },
  { name: "profile_text", weight: 1 },
  { name: "trajectory_text", weight: 0.6 },
];

const K1 = 1.2;
const B = 0.75;

interface FieldIndex {
  postings: Map<string, Map<string, number>>;
  lengths: Map<string, number>;
  totalLength: number;
}

export class LocalHybridIndex implements SearchEngine {
  readonly name = "local-hybrid (Typesense-compatible semantics)";
  private docs = new Map<string, SearchDocument>();
  private fields = new Map<string, FieldIndex>(
    FIELDS.map((f) => [f.name, { postings: new Map(), lengths: new Map(), totalLength: 0 }]),
  );
  private vocab = new Set<string>();

  upsert(doc: SearchDocument): void {
    if (this.docs.has(doc.id)) this.remove(doc.id);
    this.docs.set(doc.id, doc);
    for (const f of FIELDS) {
      const fi = this.fields.get(f.name)!;
      const ts = terms(tokenize(String(doc[f.name] ?? "")));
      fi.lengths.set(doc.id, ts.length);
      fi.totalLength += ts.length;
      const counts = new Map<string, number>();
      for (const t of ts) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const [t, n] of counts) {
        let p = fi.postings.get(t);
        if (!p) fi.postings.set(t, (p = new Map()));
        p.set(doc.id, n);
        if (!t.includes("_")) this.vocab.add(t);
      }
    }
  }

  remove(id: string): void {
    if (!this.docs.has(id)) return;
    for (const fi of this.fields.values()) {
      fi.totalLength -= fi.lengths.get(id) ?? 0;
      fi.lengths.delete(id);
      for (const p of fi.postings.values()) p.delete(id);
    }
    this.docs.delete(id);
  }

  get(id: string) {
    return this.docs.get(id);
  }

  size() {
    return this.docs.size;
  }

  ids(): string[] {
    return [...this.docs.keys()];
  }

  private passes(d: SearchDocument, f: SearchFilters | undefined): boolean {
    if (!f) return true;
    if (f.ids && !f.ids.includes(d.id)) return false;
    if (f.skills?.length && !f.skills.every((s) => d.skills.includes(s))) return false;
    if (f.metros?.length && !f.metros.includes(d.metro)) return false;
    if (f.stages?.length && !f.stages.some((s) => d.company_stages.includes(s))) return false;
    if (f.minYears != null && d.years_experience < f.minYears) return false;
    if (f.maxYears != null && d.years_experience > f.maxYears) return false;
    if (f.workModes?.length && !f.workModes.some((m) => d.work_modes.includes(m as never))) return false;
    if (f.excludeNeedsSponsorship && d.visa_needs === "needs_sponsorship") return false;
    if (f.countryCodes?.length && !f.countryCodes.includes(d.country_code)) return false;
    return true;
  }

  private queryTerms(text: string): string[] {
    const toks = tokenize(text);
    const base = terms(toks);
    // search-as-you-type: expand the final token as a prefix (like Typesense's prefix=true)
    const last = toks[toks.length - 1];
    if (last && last.length >= 3 && !this.vocab.has(last)) {
      const exp = [...this.vocab].filter((v) => v.startsWith(last)).slice(0, 4);
      base.push(...exp);
    }
    return [...new Set(base)];
  }

  private keywordScores(qterms: string[], candidates: Set<string>): Map<string, number> {
    const scores = new Map<string, number>();
    const N = this.docs.size || 1;
    for (const f of FIELDS) {
      const fi = this.fields.get(f.name)!;
      const avg = fi.totalLength / N || 1;
      for (const t of qterms) {
        const p = fi.postings.get(t);
        if (!p) continue;
        const idf = Math.log(1 + (N - p.size + 0.5) / (p.size + 0.5));
        const termBoost = t.includes("_") ? 1.4 : 1;
        for (const [id, tf] of p) {
          if (!candidates.has(id)) continue;
          const len = fi.lengths.get(id) ?? 0;
          const s = (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * len) / avg));
          scores.set(id, (scores.get(id) ?? 0) + f.weight * termBoost * s);
        }
      }
    }
    return scores;
  }

  search(q: SearchQuery): SearchResult {
    const t0 = performance.now();
    const alpha = q.alpha ?? 0.3;
    const pool = new Set([...this.docs.values()].filter((d) => this.passes(d, q.filters)).map((d) => d.id));
    const qterms = q.text.trim() ? this.queryTerms(q.text) : [];
    const kw = qterms.length ? this.keywordScores(qterms, pool) : new Map<string, number>();
    const kwRanked = [...kw.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const kwMax = kwRanked[0]?.[1] ?? 1;
    const kwRank = new Map(kwRanked.map(([id], i) => [id, i]));

    const vec = q.vector ? Array.from(q.vector) : null;
    const vecScores = new Map<string, number>();
    if (vec) {
      for (const id of pool) {
        const e = this.docs.get(id)!.embedding;
        let s = 0;
        for (let i = 0; i < e.length; i++) s += e[i]! * vec[i]!;
        vecScores.set(id, s);
      }
    }
    const vecRanked = [...vecScores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const vecRank = new Map(vecRanked.map(([id], i) => [id, i]));

    let mode: SearchResult["mode"];
    let ids: string[];
    const fused = new Map<string, number>();
    if (qterms.length && vec) {
      mode = "hybrid";
      // keyword candidates + top vector candidates (vector search contributes its own hits)
      const vecTop = vecRanked.slice(0, Math.max(50, kwRanked.length)).map(([id]) => id);
      for (const id of new Set([...kwRank.keys(), ...vecTop])) {
        const kr = kwRank.get(id);
        const vr = vecRank.get(id);
        fused.set(
          id,
          (kr !== undefined ? (1 - alpha) / (1 + kr) : 0) + (vr !== undefined ? alpha / (1 + vr) : 0),
        );
      }
      ids = [...fused.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
    } else if (qterms.length) {
      mode = "keyword";
      ids = kwRanked.map(([id]) => id);
      for (const [id, s] of kwRanked) fused.set(id, s / kwMax);
    } else if (vec) {
      mode = "vector";
      ids = vecRanked.map(([id]) => id);
      for (const [id, s] of vecRanked) fused.set(id, s);
    } else {
      mode = "browse";
      ids = [...pool].sort(
        (a, b) =>
          this.docs.get(b)!.years_experience - this.docs.get(a)!.years_experience || a.localeCompare(b),
      );
      ids.forEach((id, i) => fused.set(id, 1 / (1 + i)));
    }

    const facets: SearchResult["facets"] = {};
    for (const fb of q.facetBy ?? []) {
      const counts = new Map<string, number>();
      for (const id of ids) {
        const v = this.docs.get(id)![fb];
        for (const x of Array.isArray(v) ? v : [v])
          if (x) counts.set(String(x), (counts.get(String(x)) ?? 0) + 1);
      }
      facets[fb] = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, 24);
    }

    const offset = q.offset ?? 0;
    const limit = q.limit ?? 20;
    const hits: SearchHit[] = ids.slice(offset, offset + limit).map((id) => ({
      id,
      score: Math.round((fused.get(id) ?? 0) * 1e4) / 1e4,
      keywordScore: kw.has(id) ? Math.round((kw.get(id)! / kwMax) * 1e3) / 1e3 : null,
      vectorScore: vecScores.has(id) ? Math.round(vecScores.get(id)! * 1e3) / 1e3 : null,
      keywordRank: kwRank.get(id) ?? null,
      vectorRank: vecRank.get(id) ?? null,
      highlight: qterms.length ? highlight(this.docs.get(id)!, qterms) : null,
    }));
    return {
      hits,
      found: ids.length,
      facets,
      tookMs: Math.round((performance.now() - t0) * 100) / 100,
      mode,
    };
  }
}

function highlight(d: SearchDocument, qterms: string[]): SearchHit["highlight"] {
  const uni = new Set(qterms.filter((t) => !t.includes("_")));
  for (const field of ["headline", "profile_text"] as const) {
    const text = d[field];
    const lower = text.toLowerCase();
    const matches: [number, number][] = [];
    const re = /[a-z0-9][a-z0-9+#.]*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const t = m[0].replace(/\.+$/, "");
      if (uni.has(t)) matches.push([m.index, m.index + t.length]);
    }
    if (!matches.length) continue;
    const start = Math.max(0, matches[0]![0] - 60);
    const end = Math.min(text.length, matches[0]![1] + 120);
    return {
      field,
      snippet:
        (start > 0 ? "…" : "") + text.slice(start, end).replace(/\n/g, " ") + (end < text.length ? "…" : ""),
      matches: matches
        .filter(([a, b]) => a >= start && b <= end)
        .map(
          ([a, b]) => [a - start + (start > 0 ? 1 : 0), b - start + (start > 0 ? 1 : 0)] as [number, number],
        ),
    };
  }
  return null;
}
