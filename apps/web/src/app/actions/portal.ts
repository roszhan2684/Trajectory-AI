"use server";
import { revalidatePath } from "next/cache";
import { act, rateLimit } from "@/server/http";
import {
  answerFromPortal,
  setCandidateInterest,
  updatePortalPreferences,
} from "@/server/services/conversations";
import { candidateConsent } from "@/server/services/intros";

export async function portalAnswerAction(
  token: string,
  key: string,
  value: boolean | number | string,
  freeText?: string,
) {
  return act(async () => {
    rateLimit(`portal:${token.slice(0, 16)}`, 30);
    const job = await answerFromPortal(token, { key, value, freeText });
    return { jobId: job.id };
  });
}

export async function portalInterestAction(token: string, interested: boolean) {
  return act(() => {
    setCandidateInterest(token, interested);
    revalidatePath(`/candidate/${token}`);
    return { ok: true };
  });
}

export async function portalConsentAction(token: string, consent: boolean) {
  return act(() => {
    candidateConsent(token, consent);
    revalidatePath(`/candidate/${token}`);
    return { ok: true };
  });
}

export async function portalPrefsAction(
  token: string,
  prefs: { workModes?: ("onsite" | "hybrid" | "remote")[]; openToRelocate?: boolean; wantsAiWork?: boolean },
) {
  return act(() => updatePortalPreferences(token, prefs));
}
