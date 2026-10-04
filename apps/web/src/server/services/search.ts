/**
 * SearchService. Postgres (the store) is the source of truth; the index is derived.
 * DB change → indexCandidate (job) → build document → upsert → SearchIndexState.
 * Reconciliation compares content hashes to detect stale/missing documents.
 */
import {
  LocalHybridIndex,
  SEARCH_SCHEMA_VERSION,
  buildCandidateContext,
  buildSearchDocument,
  documentHash,
  embed,
  parseNaturalQuery,
  type Candidate,
  type CandidateContext,
  type SearchFilters,
  type SearchResult,
} from "@trajectory/engine";
import { getDB, persist } from "../db/store";
import { now, requireCap, track, type Actor } from "./core";

interface Runtime {
  index: LocalHybridIndex | null;
  contexts: Map<string, { stamp: string; cc: CandidateContext }>;
}
const g = globalThis as unknown as { __trajectorySearch?: Runtime };
const rt: Runtime = (g.__trajectorySearch ??= { index: null, contexts: new Map() });

export const SEARCH_ADAPTER = {
  name: "Local hybrid index",
  schema: SEARCH_SCHEMA_VERSION,
  typesenseConfigured: Boolean(process.env.TYPESENSE_HOST && process.env.TYPESENSE_ADMIN_API_KEY),
};

/** Index is rebuilt from the store on cold start, mirroring a re-index from Postgres. */
export function getIndex(): LocalHybridIndex {
  if (rt.index) return rt.index;
  const db = getDB();
  const idx = new LocalHybridIndex();
  for (const c of db.candidates) {
    const st = db.indexState.find((s) => s.entityId === c.id);
    if (st && st.status !== "INDEXED") continue; // a stale/missing doc stays stale until reconciled
    idx.upsert(buildSearchDocument(c));
  }
  rt.index = idx;
  return idx;
}

export function candidateContext(c: Candidate): CandidateContext {
  const hit = rt.contexts.get(c.id);
  if (hit && hit.stamp === c.updatedAt) return hit.cc;
  const cc = buildCandidateContext(c, new Date());
  rt.contexts.set(c.id, { stamp: c.updatedAt, cc });
  return cc;
}

export function invalidateCandidate(id: string): void {
  rt.contexts.delete(id);
}

export function indexCandidate(c: Candidate): { hash: string; changed: boolean } {
  const db = getDB();
  const doc = buildSearchDocument(c);
  const hash = documentHash(doc);
  getIndex().upsert(doc);
  let st = db.indexState.find((s) => s.entityId === c.id);
  const changed = st?.indexedHash !== hash;
  if (!st) {
    st = {
      entityType: "candidate",
      entityId: c.id,
      contentHash: hash,
      indexedHash: hash,
      indexedAt: now().toISOString(),
      status: "INDEXED",
      lastError: null,
    };
    db.indexState.push(st);
  } else
    Object.assign(st, {
      contentHash: hash,
      indexedHash: hash,
      indexedAt: now().toISOString(),
      status: "INDEXED",
      lastError: null,
    });
  persist();
  return { hash, changed };
}

export function removeFromIndex(id: string): void {
  const db = getDB();
  getIndex().remove(id);
  db.indexState = db.indexState.filter((s) => s.entityId !== id);
  invalidateCandidate(id);
  persist();
}

/** Mark the derived document stale after a source-of-truth change (indexing runs as a job). */
export function markStale(c: Candidate): void {
  const db = getDB();
  const hash = documentHash(buildSearchDocument(c));
  const st = db.indexState.find((s) => s.entityId === c.id);
  if (st) Object.assign(st, { contentHash: hash, status: st.indexedHash === hash ? "INDEXED" : "STALE" });
  else
    db.indexState.push({
      entityType: "candidate",
      entityId: c.id,
      contentHash: hash,
      indexedHash: null,
      indexedAt: null,
      status: "MISSING",
      lastError: null,
    });
  persist();
}

export interface ReconcileReport {
  checked: number;
  stale: string[];
  missing: string[];
  orphaned: string[];
  repaired: number;
}

export function reconcileIndex(repair: boolean): ReconcileReport {
  const db = getDB();
  const idx = getIndex();
  const report: ReconcileReport = { checked: 0, stale: [], missing: [], orphaned: [], repaired: 0 };
  for (const c of db.candidates) {
    report.checked++;
    const doc = idx.get(c.id);
    const expected = documentHash(buildSearchDocument(c));
    if (!doc) report.missing.push(c.id);
    else if (documentHash(doc) !== expected) report.stale.push(c.id);
  }
  const live = new Set(db.candidates.map((c) => c.id));
  for (const id of idx.ids()) if (!live.has(id)) report.orphaned.push(id);
  if (repair) {
    for (const id of [...report.stale, ...report.missing]) {
      indexCandidate(db.candidates.find((c) => c.id === id)!);
      report.repaired++;
    }
    for (const id of report.orphaned) {
      idx.remove(id);
      report.repaired++;
    }
  }
  return report;
}

export function rebuildIndex(): number {
  rt.index = new LocalHybridIndex();
  const db = getDB();
  for (const c of db.candidates) indexCandidate(c);
  return db.candidates.length;
}

export interface CandidateSearchInput {
  q: string;
  filters?: SearchFilters;
  mode?: "hybrid" | "keyword" | "semantic";
  limit?: number;
  offset?: number;
  parse?: boolean;
}

export function searchCandidates(
  actor: Actor,
  input: CandidateSearchInput,
): SearchResult & { parsed: ReturnType<typeof parseNaturalQuery> | null; candidates: Candidate[] } {
  requireCap(actor, "candidates.search");
  const parsed = input.parse !== false && input.q.trim() ? parseNaturalQuery(input.q) : null;
  const text = parsed ? parsed.text || input.q : input.q;
  const filters: SearchFilters = { ...(parsed?.filters ?? {}), ...(input.filters ?? {}) };
  const mode = input.mode ?? "hybrid";
  const res = getIndex().search({
    text: mode === "semantic" ? "" : text,
    vector: mode !== "keyword" && input.q.trim() ? embed(input.q) : null,
    filters,
    limit: input.limit ?? 25,
    offset: input.offset ?? 0,
    facetBy: ["skills", "metro", "company_stages", "work_modes", "visa_needs"],
  });
  const db = getDB();
  const byId = new Map(db.candidates.map((c) => [c.id, c]));
  if (input.q.trim())
    track(actor, "candidate_search", { mode: res.mode, results: res.found, took_ms: res.tookMs });
  return { ...res, parsed, candidates: res.hits.map((h) => byId.get(h.id)!).filter(Boolean) };
}
