"use server";
import { revalidatePath } from "next/cache";
import { DomainError } from "@trajectory/engine";
import { act, rateLimit } from "@/server/http";
import { actorOrThrow } from "@/server/auth/session";
import { deleteCandidate, extractPdfText, importGithub, ingestCandidate } from "@/server/services/candidates";
import { MAX_UPLOAD_BYTES } from "@/server/validation";

export async function ingestTextAction(text: string, filename: string | null) {
  return act(async () => {
    const actor = await actorOrThrow();
    rateLimit(`ingest:${actor.user.id}`, 10);
    const r = await ingestCandidate(actor, { text, filename });
    return { jobId: r.job?.id ?? null, candidateId: r.candidateId, duplicate: r.duplicate };
  });
}

export async function ingestPdfAction(form: FormData) {
  return act(async () => {
    const actor = await actorOrThrow();
    rateLimit(`ingest:${actor.user.id}`, 10);
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("VALIDATION", "Choose a PDF file.");
    if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("VALIDATION", "File is larger than 5 MB.");
    const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()), file.type);
    const r = await ingestCandidate(actor, { text, filename: file.name.slice(0, 200) });
    return { jobId: r.job?.id ?? null, candidateId: r.candidateId, duplicate: r.duplicate };
  });
}

export async function importGithubAction(candidateId: string, handle: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    importGithub(actor, candidateId, handle);
    revalidatePath(`/app/candidates/${candidateId}`);
    return { ok: true };
  });
}

export async function deleteCandidateAction(candidateId: string) {
  return act(async () => {
    const actor = await actorOrThrow();
    deleteCandidate(actor, candidateId);
    revalidatePath("/app/candidates");
    return { ok: true };
  });
}
