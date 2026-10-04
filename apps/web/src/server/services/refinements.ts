/**
 * Feedback-driven ranking refinement (spec §41). Free text → PROPOSED allowlisted deltas →
 * human confirmation → RolePreferences → re-rank job with before/after snapshots. Reversible.
 */
import {
  DomainError,
  PREFERENCE_BY_KEY,
  MAX_PREFERENCE_DELTA,
  interpretFeedback,
  type RankingRefinement,
} from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import { feedbackInput } from "../validation";
import { assertTenant, audit, now, requireCap, track, type Actor } from "./core";
import { runRoleMatching, snapshot } from "./matches";
import { enqueue } from "./jobs";

export function proposeRefinement(actor: Actor, roleId: string, raw: unknown): RankingRefinement {
  requireCap(actor, "ranking.refine");
  const { text } = feedbackInput.parse(raw);
  const db = getDB();
  const role = assertTenant(
    actor,
    db.roles.find((r) => r.id === roleId),
    "Role",
  );
  const result = interpretFeedback(text);
  const ts = now().toISOString();
  const fb = {
    id: nextId(db, "fb"),
    organizationId: role.organizationId,
    roleId,
    candidateId: null,
    matchId: null,
    userId: actor.user.id,
    type: "FREE_TEXT" as const,
    reasonCode: null,
    freeText: text,
    parsedEffect: result.proposals,
    createdAt: ts,
  };
  db.feedback.push(fb);
  const ref: RankingRefinement = {
    id: nextId(db, "ref"),
    organizationId: role.organizationId,
    roleId,
    feedbackId: fb.id,
    status: "PROPOSED",
    proposals: result.proposals,
    unrecognized: result.unrecognized,
    refused: result.refused,
    interpreterVersion: result.interpreterVersion,
    before: null,
    after: null,
    createdByUserId: actor.user.id,
    createdAt: ts,
    appliedAt: null,
    revertedAt: null,
  };
  db.refinements.push(ref);
  audit(actor, "ranking.refinement_proposed", "role", roleId, {
    refinement: ref.id,
    proposals: ref.proposals.map((p) => `${p.key}:${p.delta}`),
  });
  track(actor, "ranking_feedback_submitted", {
    type: "FREE_TEXT",
    proposals: ref.proposals.length,
    refused: ref.refused.length,
  });
  persist();
  return ref;
}

/** Apply confirmed proposals (optionally edited). Nothing changes ranking before this call. */
export async function applyRefinement(
  actor: Actor,
  refinementId: string,
  edits?: { key: string; delta: number; include: boolean }[],
) {
  requireCap(actor, "ranking.refine");
  const db = getDB();
  const ref = assertTenant(
    actor,
    db.refinements.find((r) => r.id === refinementId),
    "Refinement",
  );
  if (ref.status !== "PROPOSED")
    throw new DomainError("INVALID_STATE", `This refinement is already ${ref.status.toLowerCase()}.`);
  const chosen = ref.proposals
    .map((p) => {
      const e = edits?.find((x) => x.key === p.key);
      return e ? { ...p, delta: e.delta, include: e.include } : { ...p, include: true };
    })
    .filter((p) => p.include && PREFERENCE_BY_KEY[p.key] && p.delta !== 0)
    .map((p) => ({ ...p, delta: Math.max(-MAX_PREFERENCE_DELTA, Math.min(MAX_PREFERENCE_DELTA, p.delta)) }));
  if (!chosen.length) throw new DomainError("VALIDATION", "Select at least one preference change to apply.");
  const ts = now().toISOString();
  for (const p of chosen) {
    db.rolePreferences.push({
      id: nextId(db, "pref"),
      roleId: ref.roleId,
      key: p.key,
      weightDelta: p.delta,
      source: "FEEDBACK",
      active: true,
      refinementId: ref.id,
      createdByUserId: actor.user.id,
      createdAt: ts,
    });
  }
  ref.proposals = chosen.map(({ include: _i, ...p }) => p);
  ref.status = "APPLIED";
  ref.appliedAt = ts;
  ref.before = snapshot(ref.roleId);
  const role = db.roles.find((r) => r.id === ref.roleId)!;
  role.updatedAt = ts;
  audit(actor, "ranking.refinement_applied", "role", ref.roleId, {
    refinement: ref.id,
    deltas: chosen.map((p) => `${p.key}:${p.delta}`),
  });
  track(actor, "ranking_refinement_applied", { changes: chosen.length });
  persist();
  const { job } = await enqueue({
    type: "recompute-role-ranking",
    idempotencyKey: `recompute:${ref.id}`,
    organizationId: ref.organizationId,
    userId: actor.user.id,
    payload: { roleId: ref.roleId, refinementId: ref.id },
    steps: ["Apply preference deltas", "Re-score retrieved candidates", "Diff before/after ranking"],
    task: async (ctx) => {
      await ctx.step(
        "Apply preference deltas",
        () => chosen.length,
        (n) => `${n} allowlisted preference(s) active`,
      );
      const out = await ctx.step(
        "Re-score retrieved candidates",
        () => runRoleMatching(ref.roleId, "refinement", ctx.job.id),
        (o) => `${o.run.ranked} candidates re-ranked`,
      );
      ctx.setTrace(out.traceId);
      await ctx.step(
        "Diff before/after ranking",
        () => {
          ref.after = out.after;
          persist();
          return out.after.filter(
            (a) => ref.before!.find((b) => b.candidateId === a.candidateId)?.rank !== a.rank,
          ).length;
        },
        (n) => `${n} candidates moved`,
      );
      return { roleId: ref.roleId, traceId: out.traceId };
    },
  });
  return { refinement: ref, job };
}

export async function revertRefinement(actor: Actor, refinementId: string) {
  requireCap(actor, "ranking.refine");
  const db = getDB();
  const ref = assertTenant(
    actor,
    db.refinements.find((r) => r.id === refinementId),
    "Refinement",
  );
  if (ref.status !== "APPLIED")
    throw new DomainError("INVALID_STATE", "Only applied refinements can be reverted.");
  for (const p of db.rolePreferences.filter((x) => x.refinementId === ref.id)) p.active = false;
  ref.status = "REVERTED";
  ref.revertedAt = now().toISOString();
  db.roles.find((r) => r.id === ref.roleId)!.updatedAt = ref.revertedAt;
  audit(actor, "ranking.refinement_reverted", "role", ref.roleId, { refinement: ref.id });
  persist();
  const { job } = await enqueue({
    type: "recompute-role-ranking",
    idempotencyKey: `revert:${ref.id}`,
    organizationId: ref.organizationId,
    userId: actor.user.id,
    payload: { roleId: ref.roleId, refinementId: ref.id, revert: true },
    steps: ["Deactivate preference deltas", "Re-score retrieved candidates"],
    task: async (ctx) => {
      await ctx.step(
        "Deactivate preference deltas",
        () => ref.proposals.length,
        (n) => `${n} preference(s) deactivated`,
      );
      const out = await ctx.step(
        "Re-score retrieved candidates",
        () => runRoleMatching(ref.roleId, "revert", ctx.job.id),
        (o) => `${o.run.ranked} candidates re-ranked`,
      );
      ctx.setTrace(out.traceId);
      return { roleId: ref.roleId };
    },
  });
  return { refinement: ref, job };
}

export function discardRefinement(actor: Actor, refinementId: string) {
  requireCap(actor, "ranking.refine");
  const db = getDB();
  const ref = assertTenant(
    actor,
    db.refinements.find((r) => r.id === refinementId),
    "Refinement",
  );
  if (ref.status !== "PROPOSED")
    throw new DomainError("INVALID_STATE", "Only proposed refinements can be discarded.");
  ref.status = "DISCARDED";
  persist();
  return ref;
}
