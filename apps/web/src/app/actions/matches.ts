"use server";
import { revalidatePath } from "next/cache";
import type { MatchStatus } from "@trajectory/engine";
import { act, rateLimit } from "@/server/http";
import { actorOrThrow } from "@/server/auth/session";
import { setMatchStatus } from "@/server/services/matches";
import {
  applyRefinement,
  discardRefinement,
  proposeRefinement,
  revertRefinement,
} from "@/server/services/refinements";
import { startQualification } from "@/server/services/conversations";
import {
  approveIntro,
  cancelIntro,
  markIntroSent,
  requestConsent,
  requestIntro,
  updateDraft,
} from "@/server/services/intros";

export async function setMatchStatusAction(
  matchId: string,
  status: MatchStatus,
  reason: string | null = null,
) {
  return act(async () => {
    const actor = await actorOrThrow();
    const m = setMatchStatus(actor, matchId, status, reason);
    revalidatePath(`/app/roles/${m.roleId}/matches`);
    return { status: m.status };
  });
}

export async function proposeRefinementAction(roleId: string, text: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    rateLimit(`refine:${actor.user.id}`, 20);
    return proposeRefinement(actor, roleId, { text });
  });
}

export async function applyRefinementAction(
  refinementId: string,
  edits: { key: string; delta: number; include: boolean }[],
) {
  return act(async () => {
    const actor = await actorOrThrow();
    const { refinement, job } = await applyRefinement(actor, refinementId, edits);
    return { refinementId: refinement.id, jobId: job.id };
  });
}

export async function revertRefinementAction(refinementId: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    const { job } = await revertRefinement(actor, refinementId);
    return { jobId: job.id };
  });
}

export async function discardRefinementAction(refinementId: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    discardRefinement(actor, refinementId);
    return { ok: true };
  });
}

export async function startQualificationAction(matchId: string, keys?: string[]) {
  return act(async () => {
    const actor = await actorOrThrow();
    const r = startQualification(actor, matchId, keys);
    revalidatePath(`/app`, "layout");
    return { link: r.link, sent: r.sent };
  });
}

export async function requestIntroAction(matchId: string, note: string | null) {
  return act(async () => {
    const actor = await actorOrThrow();
    const intro = requestIntro(actor, matchId, note);
    revalidatePath(`/app`, "layout");
    return { introId: intro.id };
  });
}

export async function introTransitionAction(
  introId: string,
  op: "consent" | "approve" | "send" | "cancel",
  note?: string,
) {
  return act(async () => {
    const actor = await actorOrThrow();
    let link: string | null = null;
    if (op === "consent") link = requestConsent(actor, introId).link;
    if (op === "approve") approveIntro(actor, introId);
    if (op === "send") markIntroSent(actor, introId);
    if (op === "cancel") cancelIntro(actor, introId, note ?? null);
    revalidatePath(`/app`, "layout");
    return { link };
  });
}

export async function updateIntroDraftAction(introId: string, draft: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    updateDraft(actor, introId, draft);
    return { ok: true };
  });
}
