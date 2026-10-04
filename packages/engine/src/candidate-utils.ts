/**
 * Candidate mutations driven by explicit data (qualification answers). The same function powers
 * counterfactual simulation, so "what would change the score" and "what actually changed" share
 * one deterministic code path.
 */
import type { Availability, Candidate, EvidenceClaim, EvidenceNode, JobRole } from "./types";
import { SKILL_BY_KEY } from "./text";

export function cloneCandidate(c: Candidate): Candidate {
  return structuredClone(c);
}

export function computeProfileCompleteness(c: Candidate): number {
  const p = c.preferences;
  const checks = [
    c.city !== null,
    c.workAuthorization !== null,
    c.salaryMin !== null,
    c.availability !== null,
    p.workModes !== null,
    p.openToRelocate !== null,
    p.desiredStages !== null,
    p.minTeamSize !== null || p.maxTeamSize !== null,
    p.wantsAiWork !== null,
    c.experiences.length > 0,
    c.skills.length >= 3,
    c.projects.length > 0 || c.evidence.some((n) => n.type === "REPOSITORY"),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100) / 100;
}

export type AnswerValue = boolean | number | string;

export interface ApplyAnswerResult {
  candidate: Candidate;
  evidenceNodeId: string;
  summary: string;
}

const AVAIL_CHOICES: Record<string, Availability> = {
  Immediately: "immediate",
  "In 2 weeks": "2_weeks",
  "In about a month": "1_month",
  "In about 3 months": "3_months",
  "Not looking right now": "not_looking",
};

export function parseYesNo(v: AnswerValue): boolean | null {
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (/^(y|yes|yeah|yep|sure|absolutely|definitely|of course|i have|i do|i would|open|happy to)\b/.test(s))
    return true;
  if (/^(n|no|nope|not|never|i haven't|i have not|i don't|i do not|i wouldn't)\b/.test(s)) return false;
  return null;
}

interface ApplyOptions {
  now: Date;
  newId: (prefix: string) => string;
  verified?: boolean; // counterfactual: "if this became verified"
  freeText?: string;
  sourceId?: string | null;
}

/** Apply one structured answer to a COPY of the candidate. Never mutates the input. */
export function applyAnswer(
  input: Candidate,
  role: JobRole,
  key: string,
  value: AnswerValue,
  opts: ApplyOptions,
): ApplyAnswerResult {
  const c = cloneCandidate(input);
  const nowIso = opts.now.toISOString();
  const node: EvidenceNode = {
    id: opts.newId("ev"),
    candidateId: c.id,
    sourceId: opts.sourceId ?? null,
    type: "ANSWER",
    title: "",
    body: "",
    startOffset: null,
    endOffset: null,
    sourceLocator: "qualification conversation",
    observedAt: nowIso,
    confidence: opts.verified ? 0.95 : 0.8,
    verified: !!opts.verified,
    skills: [],
    tags: ["preference"],
    metadata: { uncertaintyKey: key },
    createdAt: nowIso,
  };
  let summary = "";
  const yes = parseYesNo(value);

  if (key === "constraint:location") {
    const mode = role.locationMode === "HYBRID" ? "hybrid" : "onsite";
    c.preferences.openToRelocate = yes === true;
    const modes = new Set(c.preferences.workModes ?? []);
    if (yes) modes.add(mode);
    else if (c.preferences.workModes === null) modes.add("remote");
    c.preferences.workModes = [...modes];
    c.preferences.sources.workModes = "CONVERSATION";
    node.title = `Willing to work ${mode} in ${role.city}`;
    node.body = yes
      ? `Confirmed willingness to work ${mode} in ${role.city}.`
      : `Not willing to work ${mode} in ${role.city}.`;
    node.metadata.field = "location";
    summary = node.body;
  } else if (key === "constraint:work_authorization") {
    const needs =
      typeof value === "string" ? /sponsor/i.test(value) && !/no sponsorship/i.test(value) : yes === false;
    c.workAuthorization = needs ? "needs_sponsorship" : "authorized";
    node.title = "Work authorization";
    node.body = needs ? "Will need visa sponsorship." : "Authorized to work without sponsorship.";
    node.metadata.field = "work_authorization";
    summary = node.body;
  } else if (key === "constraint:compensation") {
    const n =
      typeof value === "number"
        ? value
        : parseInt(String(value).replace(/[^0-9]/g, ""), 10) * (/k\b/i.test(String(value)) ? 1000 : 1);
    if (Number.isFinite(n) && n > 0) {
      c.salaryMin = n;
      c.salaryMax = Math.round(n * 1.15);
      c.currency = c.currency ?? role.currency ?? "USD";
    }
    node.title = "Compensation expectations";
    node.body = `Targeting a base salary around $${Math.round((c.salaryMin ?? 0) / 1000)}k.`;
    node.metadata.field = "compensation";
    summary = node.body;
  } else if (key.startsWith("skill:")) {
    const skillKey = key.slice(6);
    const def = SKILL_BY_KEY[skillKey];
    const label = def?.display ?? skillKey;
    node.tags = ["skill_answer"];
    if (yes === false) {
      node.title = `No production ${label} experience`;
      node.body = opts.freeText || `Has not used ${label} in production.`;
      node.metadata.negativeSkill = skillKey;
      summary = `Confirmed no production ${label} experience.`;
    } else {
      node.title = `${opts.verified ? "Verified" : "Self-reported"} production ${label} experience`;
      node.body = opts.freeText || `Has used ${label} in production.`;
      node.skills = [skillKey];
      const existing = c.skills.find((s) => s.skillKey === skillKey);
      if (existing) {
        existing.inferred = false;
        existing.confidence = Math.max(existing.confidence, opts.verified ? 0.95 : 0.75);
        existing.lastUsedAt = existing.lastUsedAt ?? new Date(opts.now.getTime() - 3.15e10).toISOString();
      } else {
        c.skills.push({
          id: opts.newId("sk"),
          candidateId: c.id,
          skillKey,
          displayName: label,
          proficiency: "proficient",
          yearsEstimate: null,
          lastUsedAt: new Date(opts.now.getTime() - 3.15e10).toISOString(),
          confidence: opts.verified ? 0.95 : 0.75,
          inferred: false,
        });
      }
      let claim = c.claims.find((cl) => cl.claimType === "skill" && cl.claimKey === skillKey);
      if (!claim) {
        claim = {
          id: opts.newId("cl"),
          candidateId: c.id,
          claimType: "skill",
          claimKey: skillKey,
          claimValue: label,
          confidence: 0.7,
          status: "PARTIAL",
          inferred: false,
          generatedBy: "qualification-answer",
          generatedAt: nowIso,
        } satisfies EvidenceClaim;
        c.claims.push(claim);
      }
      claim.status = opts.verified
        ? "SUPPORTED"
        : claim.status === "PARTIAL" || claim.status === "SUPPORTED"
          ? "SUPPORTED"
          : "PARTIAL";
      claim.inferred = false;
      claim.confidence = Math.max(claim.confidence, opts.verified ? 0.95 : 0.75);
      c.claimLinks.push({
        claimId: claim.id,
        evidenceNodeId: node.id,
        relation: "SUPPORTS",
        strength: opts.verified ? 0.95 : 0.7,
      });
      summary = `${opts.verified ? "Verified" : "Reported"} production ${label} experience.`;
    }
  } else if (key === "pref:team_size") {
    const n = role.teamSize ?? 10;
    if (yes) {
      c.preferences.minTeamSize = Math.min(c.preferences.minTeamSize ?? n, n);
      c.preferences.maxTeamSize = Math.max(c.preferences.maxTeamSize ?? n, n);
    } else {
      c.preferences.minTeamSize = n + 1;
    }
    node.title = "Team-size preference";
    node.body = yes ? `Excited by a team of ~${n}.` : `Prefers teams larger than ${n}.`;
    summary = node.body;
  } else if (key === "pref:stage") {
    const set = new Set(c.preferences.desiredStages ?? []);
    if (yes) set.add(role.companyStage);
    else set.delete(role.companyStage);
    c.preferences.desiredStages = [...set];
    node.title = "Company-stage preference";
    node.body = yes
      ? `Open to ${role.companyStage} companies.`
      : `Not interested in ${role.companyStage} companies.`;
    summary = node.body;
  } else if (key === "pref:ai_work") {
    c.preferences.wantsAiWork = yes === true;
    node.title = "Wants AI product work";
    node.body = yes ? "Wants to focus on AI/LLM products." : "Not specifically seeking AI product work.";
    summary = node.body;
  } else if (key === "availability") {
    const a = AVAIL_CHOICES[String(value)] ?? "1_month";
    c.availability = a;
    node.title = "Availability";
    node.body = `Can start: ${String(value)}.`;
    node.metadata.field = "availability";
    summary = node.body;
  } else if (key.startsWith("conflict:")) {
    const claimId = key.slice(9);
    const claim = c.claims.find((cl) => cl.id === claimId);
    if (claim) {
      claim.status = "SUPPORTED";
      claim.claimValue = String(value);
      claim.confidence = 0.85;
      c.claimLinks.push({ claimId, evidenceNodeId: node.id, relation: "SUPPORTS", strength: 0.85 });
    }
    node.title = "Resolved conflicting sources";
    node.body = `Candidate confirmed: ${String(value)}.`;
    summary = node.body;
  } else {
    node.title = "Answer";
    node.body = String(value);
    summary = String(value);
  }
  if (opts.freeText && !node.body.includes(opts.freeText)) node.body += ` “${opts.freeText}”`;
  c.evidence.push(node);
  c.profileCompleteness = computeProfileCompleteness(c);
  c.updatedAt = nowIso;
  return { candidate: c, evidenceNodeId: node.id, summary };
}

/** The favourable resolution used for "What would change the score?" simulations. */
export function favourableAnswer(key: string, role: JobRole, choices: string[] | null): AnswerValue {
  if (key === "constraint:compensation")
    return Math.round(((role.minComp ?? role.maxComp ?? 150000) + (role.maxComp ?? 150000)) / 2);
  if (key === "constraint:work_authorization") return "Authorized — no sponsorship needed";
  if (key === "availability") return "Immediately";
  if (key.startsWith("conflict:")) return choices?.[0] ?? "";
  return true;
}
