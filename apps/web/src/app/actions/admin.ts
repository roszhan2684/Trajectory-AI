"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_RANKING, type MemberRole, type RankingConfig } from "@trajectory/engine";
import { act, rateLimit } from "@/server/http";
import { actorOrThrow } from "@/server/auth/session";
import {
  changeMemberRole,
  createApiKey,
  createInvitation,
  revokeApiKey,
  updateOrganization,
} from "@/server/services/org";
import { EVAL_CONFIGS, runEvalSuite } from "@/server/services/evals";
import { rebuild, retryJob, runReconcileJob, setFailureInjection } from "@/server/services/lab";
import { requireCap, audit } from "@/server/services/core";
import { buildSeed } from "@/server/seed/build";
import { setDB } from "@/server/db/store";

export async function updateOrgAction(patch: unknown) {
  return act(async () => {
    const actor = await actorOrThrow();
    const v = z
      .object({
        name: z.string().trim().min(2).max(80).optional(),
        website: z.string().trim().max(120).optional(),
        industry: z.string().trim().max(60).optional(),
        description: z.string().trim().max(400).optional(),
        hiringManagersCanApproveIntros: z.boolean().optional(),
      })
      .parse(patch);
    updateOrganization(actor, v);
    revalidatePath("/app", "layout");
    return { ok: true };
  });
}

export async function createInviteAction(role: MemberRole, email: string | null) {
  return act(async () => {
    const actor = await actorOrThrow();
    const inv = createInvitation(actor, role, email);
    revalidatePath("/app/settings/team");
    return { link: `/invite/${inv.token}` };
  });
}

export async function changeMemberRoleAction(memberId: string, role: MemberRole) {
  return act(async () => {
    const actor = await actorOrThrow();
    changeMemberRole(actor, memberId, role);
    revalidatePath("/app/settings/team");
    return { ok: true };
  });
}

export async function createApiKeyAction(name: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    const { key, secret } = createApiKey(actor, name);
    revalidatePath("/app/settings/integrations");
    return { id: key.id, secret };
  });
}

export async function revokeApiKeyAction(id: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    revokeApiKey(actor, id);
    revalidatePath("/app/settings/integrations");
    return { ok: true };
  });
}

const blendSchema = z.object({
  deterministic: z.number().min(0).max(1),
  semantic: z.number().min(0).max(1),
  rerank: z.number().min(0).max(1),
});

export async function runEvalAction(preset: string | null, blend?: unknown) {
  return act(async () => {
    const actor = await actorOrThrow();
    rateLimit(`eval:${actor.user.id}`, 6);
    let config: RankingConfig = EVAL_CONFIGS.find((c) => c.label === preset) ?? DEFAULT_RANKING;
    if (blend) {
      const b = blendSchema.parse(blend);
      config = {
        ...DEFAULT_RANKING,
        label: `Custom blend ${b.deterministic}/${b.semantic}/${b.rerank}`,
        useSemantic: b.semantic > 0,
        useReranker: b.rerank > 0,
        blend: b,
      };
    }
    const job = await runEvalSuite(actor, config);
    return { jobId: job.id };
  });
}

export async function reconcileAction(repair: boolean) {
  return act(async () => {
    const actor = await actorOrThrow();
    const job = await runReconcileJob(actor, repair);
    return { jobId: job.id };
  });
}

export async function rebuildIndexAction() {
  return act(async () => {
    const actor = await actorOrThrow();
    return { documents: rebuild(actor) };
  });
}

export async function injectFailureAction(n: number) {
  return act(async () => {
    const actor = await actorOrThrow();
    return { next: setFailureInjection(actor, n) };
  });
}

export async function retryJobAction(jobId: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    const job = await retryJob(actor, jobId);
    return { jobId: job.id };
  });
}

/** Demo-only: rebuild the synthetic dataset. Owners only; never available in production builds. */
export async function resetDemoAction() {
  return act(async () => {
    const actor = await actorOrThrow();
    requireCap(actor, "org.manage");
    if (process.env.VERCEL_ENV === "production" && process.env.TRAJECTORY_ALLOW_DEMO_RESET !== "1")
      throw new Error("Demo reset is disabled in production.");
    rateLimit("demo-reset", 2);
    const db = await buildSeed();
    setDB(db);
    audit(null, "demo.reset", "store", "demo", { by: actor.user.email });
    revalidatePath("/", "layout");
    return { ok: true };
  });
}
