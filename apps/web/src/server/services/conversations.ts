/**
 * Candidate Qualification (spec §18.5). Picks the smallest number of high-information questions
 * (ranked by deterministic expected score impact), and applies answers as explicit data updates
 * with source=CONVERSATION. Answers never change scores except through that data.
 */
import {
  DomainError,
  applyAnswer,
  type Conversation,
  type ConversationMessage,
  type Match,
} from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import { PORTAL_TTL, sign, verify } from "../auth/tokens";
import { answerInput } from "../validation";
import { assertTenant, audit, now, requireCap, track, type Actor } from "./core";
import { ensureExplanation, runRoleMatching, clock } from "./matches";
import { indexCandidate, invalidateCandidate } from "./search";
import { enqueue } from "./jobs";

const SEVERITY = { high: 3, medium: 2, low: 1 } as const;

export function selectQuestions(m: Match, max = 2) {
  const open = m.uncertainties.filter((u) => !u.resolvedAt && u.resolutionQuestion);
  return open
    .sort((a, b) => b.expectedImpact - a.expectedImpact || SEVERITY[b.severity] - SEVERITY[a.severity])
    .slice(0, max);
}

function msg(
  db: ReturnType<typeof getDB>,
  conv: Conversation,
  senderType: ConversationMessage["senderType"],
  content: string,
  structured: ConversationMessage["structured"],
  senderId: string | null = null,
) {
  const m: ConversationMessage = {
    id: nextId(db, "msg"),
    conversationId: conv.id,
    senderType,
    senderId,
    content,
    structured,
    createdAt: now().toISOString(),
  };
  conv.messages.push(m);
  conv.updatedAt = m.createdAt;
  return m;
}

export function portalLink(conv: Conversation): string {
  return `/candidate/${conv.portalToken}`;
}

export function getOrCreateConversation(db: ReturnType<typeof getDB>, m: Match): Conversation {
  let conv = db.conversations.find((c) => c.matchId === m.id);
  if (conv) return conv;
  const id = nextId(db, "conv");
  conv = {
    id,
    organizationId: m.organizationId,
    candidateId: m.candidateId,
    roleId: m.roleId,
    matchId: m.id,
    channel: "WEB",
    status: "OPEN",
    portalToken: sign({ conv: id }, PORTAL_TTL),
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
    messages: [],
  };
  db.conversations.push(conv);
  const role = db.roles.find((r) => r.id === m.roleId)!;
  const org = db.organizations.find((o) => o.id === m.organizationId)!;
  msg(
    db,
    conv,
    "SYSTEM",
    `${org.name} thinks you could be a strong fit for ${role.title}. A couple of quick questions will help them decide — nothing is shared or sent without your consent.`,
    { kind: "note" },
  );
  return conv;
}

export function startQualification(actor: Actor, matchId: string, keys?: string[]) {
  requireCap(actor, "intro.request");
  const db = getDB();
  const m = ensureExplanation(
    assertTenant(
      actor,
      db.matches.find((x) => x.id === matchId),
      "Match",
    ),
  );
  const pool = keys?.length
    ? m.uncertainties.filter((u) => keys.includes(u.key) && !u.resolvedAt)
    : selectQuestions(m);
  if (!pool.length) throw new DomainError("INVALID_STATE", "There are no open questions for this match.");
  const conv = getOrCreateConversation(db, m);
  const asked = new Set(
    conv.messages.filter((x) => x.structured?.kind === "question").map((x) => x.structured!.uncertaintyKey),
  );
  let n = 0;
  for (const u of pool) {
    if (asked.has(u.key)) continue;
    msg(
      db,
      conv,
      "AGENT",
      u.resolutionQuestion!,
      { kind: "question", uncertaintyKey: u.key, answerKind: u.answerKind, choices: u.choices },
      null,
    );
    n++;
  }
  conv.status = "AWAITING_CANDIDATE";
  if (["NEW", "REVIEWED", "SHORTLISTED"].includes(m.status)) m.status = "QUALIFYING";
  audit(actor, "qualification.questions_sent", "match", m.id, { questions: pool.map((u) => u.key) });
  track(actor, "qualification_question_sent", {
    questions: n,
    top_impact: Math.round((pool[0]?.expectedImpact ?? 0) * 1000) / 10,
  });
  persist();
  return { conversation: conv, link: portalLink(conv), sent: n };
}

export function portalContext(token: string) {
  const data = verify<{ conv: string }>(token);
  if (!data) throw new DomainError("NOT_FOUND", "This link is invalid or has expired.");
  const db = getDB();
  const conv = db.conversations.find((c) => c.id === data.conv);
  if (!conv || conv.portalToken !== token)
    throw new DomainError("NOT_FOUND", "This link is invalid or has expired.");
  const match = conv.matchId ? (db.matches.find((m) => m.id === conv.matchId) ?? null) : null;
  const candidate = db.candidates.find((c) => c.id === conv.candidateId)!;
  const role = conv.roleId ? (db.roles.find((r) => r.id === conv.roleId) ?? null) : null;
  const org = db.organizations.find((o) => o.id === conv.organizationId)!;
  const intro = match
    ? (db.introductions.find((i) => i.matchId === match.id && i.status !== "CANCELLED") ?? null)
    : null;
  return {
    conv,
    match,
    candidate,
    role,
    org,
    intro,
    requirements: role ? db.requirements.filter((r) => r.roleId === role.id) : [],
  };
}

/** Core: apply a structured answer, re-index, re-rank. Shared by the portal and tests. */
export function applyCandidateAnswer(token: string, raw: unknown) {
  const input = answerInput.parse(raw);
  const { conv, match, candidate, role } = portalContext(token);
  if (!match || !role) throw new DomainError("INVALID_STATE", "This conversation isn't linked to a role.");
  const q = conv.messages.find(
    (x) => x.structured?.kind === "question" && x.structured.uncertaintyKey === input.key,
  );
  if (!q) throw new DomainError("NOT_FOUND", "That question isn't part of this conversation.");
  if (conv.messages.some((x) => x.structured?.kind === "answer" && x.structured.uncertaintyKey === input.key))
    throw new DomainError("CONFLICT", "You already answered this question.");
  const db = getDB();
  const before = Math.round(match.finalScore * 1000) / 10;
  const beforeRank = match.rank;
  const { candidate: updated, summary } = applyAnswer(candidate, role, input.key, input.value, {
    now: clock(),
    newId: (p) => nextId(db, p),
    freeText: input.freeText,
    sourceId: null,
  });
  updated.updatedAt = now().toISOString();
  db.candidates[db.candidates.findIndex((c) => c.id === candidate.id)] = updated;
  msg(
    db,
    conv,
    "CANDIDATE",
    typeof input.value === "boolean"
      ? (input.value ? "Yes" : "No") + (input.freeText ? ` — ${input.freeText}` : "")
      : String(input.value) + (input.freeText ? ` — ${input.freeText}` : ""),
    { kind: "answer", uncertaintyKey: input.key, value: input.value },
  );
  invalidateCandidate(updated.id);
  indexCandidate(updated);
  const out = runRoleMatching(role.id, "qualification");
  const after = db.matches.find((m) => m.id === match.id)!;
  const u = match.uncertainties.find((x) => x.key === input.key);
  if (u) u.resolvedAt = now().toISOString();
  msg(
    db,
    conv,
    "SYSTEM",
    `${summary} Match score ${before} → ${Math.round(after.finalScore * 1000) / 10}${after.rank > 0 && beforeRank > 0 && after.rank !== beforeRank ? ` (rank #${beforeRank} → #${after.rank})` : ""}.`,
    {
      kind: "score_update",
      uncertaintyKey: input.key,
      scoreBefore: before,
      scoreAfter: Math.round(after.finalScore * 1000) / 10,
    },
  );
  const pending = conv.messages
    .filter((x) => x.structured?.kind === "question")
    .filter(
      (qq) =>
        !conv.messages.some(
          (a) =>
            a.structured?.kind === "answer" && a.structured.uncertaintyKey === qq.structured!.uncertaintyKey,
        ),
    );
  conv.status = pending.length ? "AWAITING_CANDIDATE" : "RESOLVED";
  audit(null, "qualification.answered", "match", match.id, {
    key: input.key,
    scoreBefore: before,
    scoreAfter: after.finalScore,
    traceId: out.traceId,
  });
  track(null, "qualification_answered", {
    key_kind: input.key.split(":")[0]!,
    delta: Math.round((after.finalScore * 100 - before) * 10) / 10,
  });
  persist();
  return {
    scoreBefore: before,
    scoreAfter: Math.round(after.finalScore * 1000) / 10,
    rankBefore: beforeRank,
    rankAfter: after.rank,
    summary,
    traceId: out.traceId,
  };
}

/** Portal entry point: runs the qualify-candidate task through the job runner. */
export async function answerFromPortal(token: string, raw: unknown) {
  const { conv } = portalContext(token);
  const input = answerInput.parse(raw);
  const { job } = await enqueue({
    type: "qualify-candidate",
    idempotencyKey: `qualify:${conv.id}:${input.key}`,
    organizationId: conv.organizationId,
    userId: null,
    payload: { conversationId: conv.id, key: input.key },
    steps: [
      "Validate answer",
      "Update evidence (source=CONVERSATION) & re-index",
      "Recompute affected match",
    ],
    maxAttempts: 1,
    task: async (ctx) => {
      await ctx.step(
        "Validate answer",
        () => input.key,
        () => "answer matches an open question",
      );
      const r = await ctx.step(
        "Update evidence (source=CONVERSATION) & re-index",
        () => applyCandidateAnswer(token, input),
        (x) => x.summary,
      );
      await ctx.step(
        "Recompute affected match",
        () => r,
        (x) => `score ${x.scoreBefore} → ${x.scoreAfter}`,
      );
      ctx.setTrace(r.traceId);
      return r as unknown as Record<string, unknown>;
    },
  });
  return job;
}

export function setCandidateInterest(token: string, interested: boolean) {
  const { conv, match } = portalContext(token);
  const db = getDB();
  msg(
    db,
    conv,
    "CANDIDATE",
    interested ? "I'm interested in this role." : "Not interested right now, thanks.",
    { kind: "interest", value: interested },
  );
  if (match)
    match.status = interested ? (match.status === "INTRO_REQUESTED" ? match.status : "INTERESTED") : "CLOSED";
  audit(null, interested ? "candidate.interested" : "candidate.declined", "match", match?.id ?? conv.id, {});
  persist();
  return conv;
}

export function updatePortalPreferences(
  token: string,
  prefs: { workModes?: ("onsite" | "hybrid" | "remote")[]; openToRelocate?: boolean; wantsAiWork?: boolean },
) {
  const { candidate } = portalContext(token);
  const db = getDB();
  const c = db.candidates.find((x) => x.id === candidate.id)!;
  if (prefs.workModes)
    c.preferences.workModes = prefs.workModes.filter((m) => ["onsite", "hybrid", "remote"].includes(m));
  if (typeof prefs.openToRelocate === "boolean") c.preferences.openToRelocate = prefs.openToRelocate;
  if (typeof prefs.wantsAiWork === "boolean") c.preferences.wantsAiWork = prefs.wantsAiWork;
  c.preferences.sources.workModes = "CONVERSATION";
  c.preferences.updatedAt = c.updatedAt = now().toISOString();
  invalidateCandidate(c.id);
  indexCandidate(c);
  persist();
  return c.preferences;
}
