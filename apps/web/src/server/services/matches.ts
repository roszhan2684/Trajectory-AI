/**
 * MatchService — role matching runs, persistence, match detail and status changes.
 * Re-runs upsert by (roleId, candidateId): replays never duplicate matches, and recruiter
 * decisions (status) plus previous rank survive re-ranking.
 */
import {
  DEFAULT_RANKING,
  DEMO_AS_OF,
  DomainError,
  LSA_VERSION,
  RERANKER_VERSION,
  SCORE_VERSION,
  EXPLAINER_VERSION,
  buildRoleContext,
  computeRerank,
  computeTrajectory,
  counterfactuals,
  generateExplanation,
  hashString,
  runMatchingPipeline,
  scoreCandidate,
  type Match,
  type MatchStatus,
  type RankSnapshot,
  type RankingConfig,
  type RoleContext,
} from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import type { MatchRun } from "../db/schema";
import { Tracer, assertTenant, audit, now, requireCap, track, type Actor } from "./core";
import { candidateContext, getIndex } from "./search";
import { enqueue } from "./jobs";

export const clock = () => DEMO_AS_OF;

export function roleContext(roleId: string): RoleContext {
  const db = getDB();
  const role = db.roles.find((r) => r.id === roleId);
  if (!role) throw new DomainError("NOT_FOUND", "Role not found.");
  return buildRoleContext(
    role,
    db.requirements.filter((r) => r.roleId === roleId),
    db.rolePreferences.filter((p) => p.roleId === roleId && p.active),
    clock(),
  );
}

export function snapshot(roleId: string): RankSnapshot[] {
  return getDB()
    .matches.filter((m) => m.roleId === roleId && m.rank > 0)
    .sort((a, b) => a.rank - b.rank)
    .map((m) => ({
      candidateId: m.candidateId,
      rank: m.rank,
      finalScore: m.finalScore,
      components: Object.fromEntries(m.components.map((c) => [c.key, c.contribution])),
    }));
}

export interface MatchingOutcome {
  run: MatchRun;
  before: RankSnapshot[];
  after: RankSnapshot[];
  traceId: string;
}

/** Core matching task — pure w.r.t. the runner; used by jobs, seed and tests. */
export function runRoleMatching(
  roleId: string,
  trigger: MatchRun["trigger"],
  jobId: string | null = null,
  config: RankingConfig = DEFAULT_RANKING,
): MatchingOutcome {
  const db = getDB();
  const role = db.roles.find((r) => r.id === roleId)!;
  const before = snapshot(roleId);
  const tracer = new Tracer("role_match_generation", role.organizationId, {
    roleId,
    scoreVersion: SCORE_VERSION,
    promptVersion: EXPLAINER_VERSION,
    model: `${RERANKER_VERSION}+${LSA_VERSION}`,
    trigger,
  });
  const startedAt = now().toISOString();
  const rc = tracer.span("role_normalization", "span", () => roleContext(roleId), {
    requirements: db.requirements.filter((r) => r.roleId === roleId).length,
  });
  const contexts = tracer.span(
    "load_candidate_contexts",
    "span",
    () => new Map(db.candidates.map((c) => [c.id, candidateContext(c)])),
    { candidates: db.candidates.length },
  );
  const result = runMatchingPipeline(rc, contexts, getIndex(), { config });
  for (const t of result.timings)
    tracer.record(
      t.stage,
      t.stage === "llm_rerank" || t.stage === "explanation" ? "generation" : "span",
      t.ms,
      { detail: t.detail },
    );

  const ts = now().toISOString();
  const existing = new Map(db.matches.filter((m) => m.roleId === roleId).map((m) => [m.candidateId, m]));
  const seen = new Set<string>();
  const persistOne = (s: (typeof result.ranked)[number] | (typeof result.filtered)[number], rank: number) => {
    seen.add(s.candidateId);
    const prev = existing.get(s.candidateId);
    const id = prev?.id ?? nextId(db, "mat");
    const full = "uncertaintiesFull" in s ? s : null;
    const m: Match = {
      id,
      organizationId: role.organizationId,
      roleId,
      candidateId: s.candidateId,
      retrievalScore: full?.retrievalScore ?? null,
      keywordScore: full?.keywordScore ?? null,
      deterministicScore: s.deterministic,
      semanticScore: s.semantic,
      rerankScore: s.rerank?.relevance ?? null,
      finalScore: s.final,
      confidenceScore: s.confidence,
      hardConstraintStatus: s.hardConstraintStatus,
      constraints: s.constraints,
      rank,
      previousRank: prev ? prev.rank : null,
      previousFinalScore: prev ? prev.finalScore : null,
      status: prev?.status ?? "NEW",
      scoreVersion: SCORE_VERSION,
      components: s.components,
      uncertainties: (
        full?.uncertaintiesFull ?? s.uncertainties.map((u) => ({ ...u, expectedImpact: 0 }))
      ).map((u) => ({ ...u, id: `${id}:${u.key}`, resolvedAt: null })),
      rerank: s.rerank,
      explanation: full?.explanation ?? null,
      generatedAt: prev?.generatedAt ?? ts,
      updatedAt: ts,
    };
    if (prev) Object.assign(prev, m);
    else db.matches.push(m);
  };
  tracer.span("persist_matches", "span", () => {
    result.ranked.forEach((s, i) => persistOne(s, i + 1));
    result.filtered.forEach((s) => persistOne(s, -1));
    // candidates no longer retrieved: keep ones a human acted on, drop untouched ones
    db.matches = db.matches.filter(
      (m) => m.roleId !== roleId || seen.has(m.candidateId) || m.status !== "NEW",
    );
    for (const m of db.matches) if (m.roleId === roleId && !seen.has(m.candidateId)) m.rank = 0;
  });
  const trace = tracer.finish();
  const run: MatchRun = {
    id: nextId(db, "mrun"),
    organizationId: role.organizationId,
    roleId,
    jobId,
    trigger,
    scoreVersion: SCORE_VERSION,
    configLabel: config.label,
    retrieved: result.retrieved,
    ranked: result.ranked.length,
    filtered: result.filtered.length,
    startedAt,
    completedAt: now().toISOString(),
    traceId: trace.id,
  };
  db.matchRuns.push(run);
  persist();
  return { run, before, after: snapshot(roleId), traceId: trace.id };
}

function roleVersionKey(roleId: string): string {
  const db = getDB();
  const role = db.roles.find((r) => r.id === roleId)!;
  const prefs = db.rolePreferences
    .filter((p) => p.roleId === roleId && p.active)
    .map((p) => `${p.key}${p.weightDelta}`);
  const reqs = db.requirements
    .filter((r) => r.roleId === roleId)
    .map((r) => `${r.normalizedKey}${r.importance}`);
  const pool =
    db.candidates
      .map((c) => c.updatedAt)
      .sort()
      .pop() ?? "";
  return hashString([role.updatedAt, ...prefs, ...reqs, pool, db.candidates.length].join("|"));
}

/** Enqueue a matching run (async, idempotent per role version). */
export async function generateMatches(actor: Actor, roleId: string, trigger: MatchRun["trigger"] = "manual") {
  requireCap(actor, "roles.edit");
  const db = getDB();
  const role = assertTenant(
    actor,
    db.roles.find((r) => r.id === roleId),
    "Role",
  );
  if (role.status === "DRAFT")
    throw new DomainError("INVALID_STATE", "Activate the role before generating matches.");
  track(actor, "matching_run_started", { trigger });
  const { job, deduplicated } = await enqueue({
    type: "generate-role-matches",
    idempotencyKey: `generate-role-matches:${roleId}:${roleVersionKey(roleId)}`,
    organizationId: role.organizationId,
    userId: actor.user.id,
    payload: { roleId, trigger },
    steps: [
      "Load role, requirements & preferences",
      "Hybrid retrieval → constraints → scoring → rerank",
      "Persist ranking & explanations",
    ],
    task: async (ctx) => {
      await ctx.step(
        "Load role, requirements & preferences",
        () => roleContext(roleId),
        (rc) => `${rc.reqs.length} requirements, ${rc.prefs.length} active preferences`,
      );
      const out = await ctx.step(
        "Hybrid retrieval → constraints → scoring → rerank",
        () => runRoleMatching(roleId, trigger, ctx.job.id),
        (o) =>
          `${o.run.retrieved} retrieved · ${o.run.ranked} ranked · ${o.run.filtered} failed hard constraints`,
      );
      ctx.setTrace(out.traceId);
      await ctx.step(
        "Persist ranking & explanations",
        () => out.after.length,
        (n) => `${n} matches persisted (upserted by role × candidate)`,
      );
      audit(actor, "role.matches_generated", "role", roleId, { run: out.run.id });
      track(actor, "matching_run_completed", { ranked: out.run.ranked, filtered: out.run.filtered });
      return { runId: out.run.id, ranked: out.run.ranked, filtered: out.run.filtered, traceId: out.traceId };
    },
  });
  return { job, deduplicated };
}

// ------------------------------------------------------------------------------ reads
export function listMatches(actor: Actor, roleId: string) {
  requireCap(actor, "candidates.search");
  const db = getDB();
  const role = assertTenant(
    actor,
    db.roles.find((r) => r.id === roleId),
    "Role",
  );
  const all = db.matches.filter((m) => m.roleId === role.id);
  const byId = new Map(db.candidates.map((c) => [c.id, c]));
  const shape = (m: Match) => ({ match: m, candidate: byId.get(m.candidateId)! });
  return {
    role,
    ranked: all
      .filter((m) => m.rank > 0)
      .sort((a, b) => a.rank - b.rank)
      .map(shape),
    filtered: all
      .filter((m) => m.rank === -1)
      .sort((a, b) => b.finalScore - a.finalScore)
      .map(shape),
    lastRun: db.matchRuns.filter((r) => r.roleId === role.id).pop() ?? null,
  };
}

/** Explanation for matches outside the explained top-N is generated on demand and cached. */
export function ensureExplanation(m: Match): Match {
  if (m.explanation) return m;
  const db = getDB();
  const c = db.candidates.find((x) => x.id === m.candidateId)!;
  const rc = roleContext(m.roleId);
  const cc = candidateContext(c);
  const rerank = m.rerank ?? computeRerank(rc, cc);
  const config = m.rerank ? DEFAULT_RANKING : { ...DEFAULT_RANKING, useReranker: false };
  const s = scoreCandidate(rc, cc, { config, semantic: m.semanticScore, rerank: m.rerank ? rerank : null });
  const cfs = counterfactuals(rc, cc, s, s.uncertainties, config);
  m.uncertainties = s.uncertainties.map((u) => {
    const cf = cfs.find((x) => x.key === u.key);
    return {
      ...u,
      id: `${m.id}:${u.key}`,
      expectedImpact: cf ? Math.max(0, cf.finalAfter - cf.finalBefore) / 100 : 0,
      resolvedAt: null,
    };
  });
  m.explanation = generateExplanation(rc, cc, s, m.uncertainties, config, cfs);
  persist();
  return m;
}

export function getMatchDetail(actor: Actor, matchId: string) {
  requireCap(actor, "candidates.search");
  const db = getDB();
  const m = ensureExplanation(
    assertTenant(
      actor,
      db.matches.find((x) => x.id === matchId),
      "Match",
    ),
  );
  const candidate = db.candidates.find((c) => c.id === m.candidateId)!;
  const role = db.roles.find((r) => r.id === m.roleId)!;
  const rc = roleContext(role.id);
  const trajectory = computeTrajectory(rc, candidateContext(candidate));
  const conversation = db.conversations.find((c) => c.matchId === m.id) ?? null;
  const intro = db.introductions.find((i) => i.matchId === m.id && i.status !== "CANCELLED") ?? null;
  const feedback = db.feedback.filter((f) => f.matchId === m.id);
  const activity = db.audit
    .filter(
      (a) =>
        a.entityId === m.id ||
        a.entityId === candidate.id ||
        (a.entityType === "introduction" && intro && a.entityId === intro.id),
    )
    .slice(-30)
    .reverse();
  const neighbours = db.matches
    .filter((x) => x.roleId === role.id && x.rank > 0)
    .sort((a, b) => a.rank - b.rank);
  const idx = neighbours.findIndex((x) => x.id === m.id);
  track(actor, "match_opened", { rank: m.rank, score: Math.round(m.finalScore * 100) });
  return {
    match: m,
    candidate,
    role,
    requirements: db.requirements.filter((r) => r.roleId === role.id),
    preferences: db.rolePreferences.filter((p) => p.roleId === role.id && p.active),
    trajectory,
    conversation,
    intro,
    feedback,
    activity,
    prevId: idx > 0 ? neighbours[idx - 1]!.id : null,
    nextId: idx >= 0 && idx < neighbours.length - 1 ? neighbours[idx + 1]!.id : null,
  };
}

const STATUS_FEEDBACK: Partial<Record<MatchStatus, "SHORTLIST" | "REJECT">> = {
  SHORTLISTED: "SHORTLIST",
  REJECTED: "REJECT",
};

export function setMatchStatus(
  actor: Actor,
  matchId: string,
  status: MatchStatus,
  reasonCode: string | null = null,
) {
  requireCap(actor, "ranking.refine");
  const db = getDB();
  const m = assertTenant(
    actor,
    db.matches.find((x) => x.id === matchId),
    "Match",
  );
  const from = m.status;
  m.status = status;
  m.updatedAt = now().toISOString();
  const type = STATUS_FEEDBACK[status];
  if (type) {
    db.feedback.push({
      id: nextId(db, "fb"),
      organizationId: m.organizationId,
      roleId: m.roleId,
      candidateId: m.candidateId,
      matchId: m.id,
      userId: actor.user.id,
      type,
      reasonCode,
      freeText: null,
      parsedEffect: null,
      createdAt: now().toISOString(),
    });
    track(actor, "ranking_feedback_submitted", { type, reason: reasonCode });
  }
  audit(actor, "match.status_changed", "match", m.id, { from, to: status, reasonCode });
  persist();
  return m;
}
