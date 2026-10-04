"use server";
import { revalidatePath } from "next/cache";
import type { RoleStatus } from "@trajectory/engine";
import { act, rateLimit } from "@/server/http";
import { actorOrThrow } from "@/server/auth/session";
import { briefInput } from "@/server/validation";
import {
  activateRole,
  createRole,
  parseBrief,
  proposalToDraft,
  setRoleStatus,
  updateRole,
} from "@/server/services/roles";
import { generateMatches } from "@/server/services/matches";

export async function parseBriefAction(text: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    rateLimit(`parse:${actor.user.id}`, 20);
    const { text: t } = briefInput.parse({ text });
    const proposal = parseBrief(actor, t);
    return { proposal, draft: proposalToDraft(proposal, t) };
  });
}

export async function createRoleAction(draft: unknown, activate: boolean) {
  return act(async () => {
    const actor = await actorOrThrow();
    const role = createRole(actor, draft);
    let jobId: string | null = null;
    if (activate) jobId = (await activateRole(actor, role.id)).job.id;
    revalidatePath("/app/roles");
    return { roleId: role.id, jobId };
  });
}

export async function updateRoleAction(roleId: string, draft: unknown) {
  return act(async () => {
    const actor = await actorOrThrow();
    updateRole(actor, roleId, draft);
    revalidatePath(`/app/roles/${roleId}`);
    return { roleId };
  });
}

export async function activateRoleAction(roleId: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    const { job } = await activateRole(actor, roleId);
    revalidatePath(`/app/roles/${roleId}`);
    return { jobId: job.id };
  });
}

export async function setRoleStatusAction(roleId: string, status: RoleStatus) {
  return act(async () => {
    const actor = await actorOrThrow();
    setRoleStatus(actor, roleId, status);
    revalidatePath(`/app/roles/${roleId}`);
    revalidatePath("/app/roles");
    return { ok: true };
  });
}

export async function generateMatchesAction(roleId: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    rateLimit(`match:${actor.org.id}`, 12);
    const { job, deduplicated } = await generateMatches(actor, roleId, "manual");
    return { jobId: job.id, deduplicated, status: job.status };
  });
}
