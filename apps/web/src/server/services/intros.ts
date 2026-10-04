/**
 * Introductions (spec §42): DRAFT → AWAITING_CANDIDATE → READY_FOR_APPROVAL → APPROVED → SENT,
 * with DECLINED/CANCELLED exits. Candidate consent and recruiter approval are both required.
 * "SENT" is an internal demo action unless a messaging integration is configured — labeled so.
 */
import { DomainError, assertTransition, can, type Introduction, type IntroStatus } from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import { assertTenant, audit, now, requireCap, track, type Actor } from "./core";
import { getOrCreateConversation, portalContext, portalLink } from "./conversations";
import { ensureExplanation } from "./matches";

export const MESSAGING_CONFIGURED = Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL);

function transition(
  intro: Introduction,
  to: IntroStatus,
  byUserId: string | null,
  note: string | null = null,
) {
  assertTransition(intro.status, to);
  intro.status = to;
  intro.updatedAt = now().toISOString();
  intro.history.push({ status: to, at: intro.updatedAt, byUserId, note });
}

export function requestIntro(actor: Actor, matchId: string, note: string | null) {
  requireCap(actor, "intro.request");
  const db = getDB();
  const m = assertTenant(
    actor,
    db.matches.find((x) => x.id === matchId),
    "Match",
  );
  if (m.hardConstraintStatus === "FAIL")
    throw new DomainError("INVALID_STATE", "This candidate fails a hard constraint for the role.");
  const open = db.introductions.find(
    (i) => i.matchId === m.id && !["CANCELLED", "DECLINED"].includes(i.status),
  );
  if (open) return open;
  const ts = now().toISOString();
  const intro: Introduction = {
    id: nextId(db, "intro"),
    organizationId: m.organizationId,
    roleId: m.roleId,
    candidateId: m.candidateId,
    matchId: m.id,
    requestedByUserId: actor.user.id,
    status: "DRAFT",
    recruiterNote: note?.slice(0, 1000) ?? null,
    draft: null,
    draftEvidenceIds: [],
    candidateConsentAt: null,
    approvedByUserId: null,
    approvedAt: null,
    sentAt: null,
    deliveryChannel: MESSAGING_CONFIGURED ? "email" : "demo_internal",
    history: [{ status: "DRAFT", at: ts, byUserId: actor.user.id, note }],
    createdAt: ts,
    updatedAt: ts,
  };
  db.introductions.push(intro);
  m.status = "INTRO_REQUESTED";
  audit(actor, "intro.requested", "introduction", intro.id, { matchId: m.id });
  track(actor, "intro_requested", { rank: m.rank });
  persist();
  return intro;
}

/** Ask the candidate for consent via their portal (no outbound message is sent automatically). */
export function requestConsent(actor: Actor, introId: string) {
  requireCap(actor, "intro.request");
  const db = getDB();
  const intro = assertTenant(
    actor,
    db.introductions.find((i) => i.id === introId),
    "Introduction",
  );
  transition(intro, "AWAITING_CANDIDATE", actor.user.id);
  const m = db.matches.find((x) => x.id === intro.matchId)!;
  const conv = getOrCreateConversation(db, m);
  const role = db.roles.find((r) => r.id === intro.roleId)!;
  conv.messages.push({
    id: nextId(db, "msg"),
    conversationId: conv.id,
    senderType: "RECRUITER",
    senderId: actor.user.id,
    content: `Would you like an introduction to the hiring team for ${role.title}? We'll only make it with your consent.`,
    structured: { kind: "interest" },
    createdAt: now().toISOString(),
  });
  conv.status = "AWAITING_CANDIDATE";
  audit(actor, "intro.consent_requested", "introduction", intro.id, {});
  persist();
  return { intro, link: portalLink(conv) };
}

function draftIntro(intro: Introduction): { text: string; evidenceIds: string[] } {
  const db = getDB();
  const m = ensureExplanation(db.matches.find((x) => x.id === intro.matchId)!);
  const c = db.candidates.find((x) => x.id === intro.candidateId)!;
  const role = db.roles.find((r) => r.id === intro.roleId)!;
  const org = db.organizations.find((o) => o.id === intro.organizationId)!;
  const hm = db.members
    .filter((x) => x.organizationId === org.id && x.role === "HIRING_MANAGER")
    .map((x) => db.users.find((u) => u.id === x.userId)!)[0];
  const reasons = (m.explanation?.whyMatch ?? []).slice(0, 3);
  const first = c.fullName.split(" ")[0];
  const lines = [
    `Hi ${hm?.displayName.split(" ")[0] ?? "team"} and ${first},`,
    "",
    `Introducing you two for the ${role.title} role at ${org.name}. ${first} confirmed they're interested.`,
    "",
    "Why we think this is worth a conversation:",
    ...reasons.map((r) => `• ${r.text.replace(/^[^:]+:\s*/, "")}`),
    "",
    `Open question worth covering live: ${m.uncertainties[0]?.description ?? "none — the profile is well evidenced."}`,
    "",
    "Suggested next step: a 30-minute call this week.",
  ];
  return { text: lines.join("\n"), evidenceIds: [...new Set(reasons.flatMap((r) => r.evidenceIds))] };
}

export function candidateConsent(token: string, consent: boolean) {
  const { intro } = portalContext(token);
  if (!intro) throw new DomainError("NOT_FOUND", "There's no pending introduction for this role.");
  if (intro.status !== "AWAITING_CANDIDATE")
    throw new DomainError("INVALID_STATE", "This introduction isn't waiting for your response.");
  const db = getDB();
  if (consent) {
    transition(intro, "READY_FOR_APPROVAL", null, "Candidate consented in portal");
    intro.candidateConsentAt = now().toISOString();
    const d = draftIntro(intro);
    intro.draft = d.text;
    intro.draftEvidenceIds = d.evidenceIds;
  } else {
    transition(intro, "DECLINED", null, "Candidate declined in portal");
    const m = db.matches.find((x) => x.id === intro.matchId);
    if (m) m.status = "CLOSED";
  }
  audit(
    null,
    consent ? "intro.candidate_consented" : "intro.candidate_declined",
    "introduction",
    intro.id,
    {},
  );
  persist();
  return intro;
}

export function updateDraft(actor: Actor, introId: string, draft: string) {
  requireCap(actor, "intro.request");
  const intro = assertTenant(
    actor,
    getDB().introductions.find((i) => i.id === introId),
    "Introduction",
  );
  if (!["READY_FOR_APPROVAL", "APPROVED"].includes(intro.status))
    throw new DomainError("INVALID_STATE", "The draft can only be edited before sending.");
  intro.draft = draft.slice(0, 4000);
  intro.updatedAt = now().toISOString();
  persist();
  return intro;
}

export function approveIntro(actor: Actor, introId: string) {
  requireCap(actor, "intro.approve");
  const db = getDB();
  const intro = assertTenant(
    actor,
    db.introductions.find((i) => i.id === introId),
    "Introduction",
  );
  if (!intro.candidateConsentAt)
    throw new DomainError("INVALID_STATE", "The candidate hasn't consented yet.");
  transition(intro, "APPROVED", actor.user.id);
  intro.approvedByUserId = actor.user.id;
  intro.approvedAt = intro.updatedAt;
  audit(actor, "intro.approved", "introduction", intro.id, {});
  track(actor, "intro_approved", {});
  persist();
  return intro;
}

export function markIntroSent(actor: Actor, introId: string) {
  requireCap(actor, "intro.approve");
  const db = getDB();
  const intro = assertTenant(
    actor,
    db.introductions.find((i) => i.id === introId),
    "Introduction",
  );
  if (!intro.approvedAt)
    throw new DomainError("INVALID_STATE", "An introduction must be approved before it is sent.");
  transition(
    intro,
    "SENT",
    actor.user.id,
    intro.deliveryChannel === "demo_internal"
      ? "Recorded as sent (demo — no messaging integration configured)"
      : "Sent via email",
  );
  intro.sentAt = intro.updatedAt;
  const m = db.matches.find((x) => x.id === intro.matchId);
  if (m) m.status = "INTRODUCED";
  audit(actor, "intro.sent", "introduction", intro.id, { channel: intro.deliveryChannel });
  track(actor, "intro_sent", { channel: intro.deliveryChannel });
  persist();
  return intro;
}

export function cancelIntro(actor: Actor, introId: string, reason: string | null) {
  requireCap(actor, "intro.request");
  const db = getDB();
  const intro = assertTenant(
    actor,
    db.introductions.find((i) => i.id === introId),
    "Introduction",
  );
  transition(intro, "CANCELLED", actor.user.id, reason);
  audit(actor, "intro.cancelled", "introduction", intro.id, { reason });
  persist();
  return intro;
}

export function listIntros(actor: Actor) {
  const db = getDB();
  return db.introductions
    .filter((i) => i.organizationId === actor.org.id)
    .map((intro) => ({
      intro,
      candidate: db.candidates.find((c) => c.id === intro.candidateId)!,
      role: db.roles.find((r) => r.id === intro.roleId)!,
      match: db.matches.find((m) => m.id === intro.matchId) ?? null,
      requestedBy: db.users.find((u) => u.id === intro.requestedByUserId) ?? null,
      approvedBy: intro.approvedByUserId
        ? (db.users.find((u) => u.id === intro.approvedByUserId) ?? null)
        : null,
      portal: (() => {
        const conv = db.conversations.find((c) => c.matchId === intro.matchId);
        return conv ? portalLink(conv) : null;
      })(),
      canApprove: can(actor.role, "intro.approve", actor.org),
    }))
    .sort((a, b) => b.intro.updatedAt.localeCompare(a.intro.updatedAt));
}
