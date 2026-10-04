/**
 * Ingestion: parsed resume (+ optional GitHub/import metadata) → Candidate with evidence graph.
 * Used by BOTH the upload flow and the seed generator, so demo data is produced by the same
 * code path as real ingestion.
 */
import type {
  Availability,
  Candidate,
  CandidatePreferences,
  CandidateSource,
  ClaimStatus,
  EvidenceClaim,
  EvidenceClaimLink,
  EvidenceNode,
  WorkAuthorization,
} from "../types";
import { SKILL_BY_KEY, extractSkillMentions, hashString } from "../text";
import { computeProfileCompleteness } from "../candidate-utils";
import { PROFILE_PARSER_VERSION } from "../scoring/config";
import { tagText, type ParsedProfile } from "./profile-parser";

export interface RepoMeta {
  name: string;
  description: string;
  language: string;
  stars: number;
  lastCommitAt: string;
  url: string;
}

export interface IngestExtras {
  id: string;
  synthetic: boolean;
  email?: string;
  workAuthorization?: WorkAuthorization | null;
  salaryMin?: number | null;
  availability?: Availability | null;
  preferences?: Partial<CandidatePreferences>;
  repos?: RepoMeta[];
  importedProfile?: { title: string; company: string; note: string } | null;
  seniorities?: number[];
  projectMeta?: { shipped: boolean; startYear: number | null }[];
  sourceFilename?: string | null;
}

export function inferSeniority(title: string): number {
  const t = title.toLowerCase();
  if (/\b(cto|vp|vice president|director|head of)\b/.test(t)) return 6;
  if (/\b(staff|principal|lead|manager|architect|founder|co-founder)\b/.test(t)) return 5;
  if (/\bsenior|sr\.?\b/.test(t)) return 4;
  if (/\b(junior|jr\.?|associate|intern|graduate)\b/.test(t)) return 1;
  if (/\bfounding\b/.test(t)) return 4;
  return 3;
}

/** Claim status from independent supporting evidence. Self-listed skills alone stay UNSUPPORTED. */
export function deriveSkillClaims(
  c: Candidate,
  now: Date,
  newId: (p: string) => string,
): { claims: EvidenceClaim[]; links: EvidenceClaimLink[] } {
  const support = new Map<string, EvidenceNode[]>();
  for (const n of c.evidence) {
    if (n.type === "PROFILE_FIELD" || n.type === "EXPERIENCE") continue;
    for (const s of n.skills) support.set(s, [...(support.get(s) ?? []), n]);
  }
  for (const n of c.evidence.filter((x) => x.type === "EXPERIENCE"))
    for (const s of n.skills) if (!support.has(s)) support.set(s, [n]);
  const claims: EvidenceClaim[] = [];
  const links: EvidenceClaimLink[] = [];
  for (const sk of c.skills) {
    const nodes = (support.get(sk.skillKey) ?? []).filter((n) => !n.tags.includes("self_listed"));
    const sources = new Set(nodes.map((n) => n.sourceId));
    const status: ClaimStatus =
      nodes.length >= 2 || (nodes.length >= 1 && sources.size >= 2)
        ? "SUPPORTED"
        : nodes.length === 1
          ? "PARTIAL"
          : "UNSUPPORTED";
    const id = newId("cl");
    claims.push({
      id,
      candidateId: c.id,
      claimType: "skill",
      claimKey: sk.skillKey,
      claimValue: sk.displayName,
      confidence:
        status === "SUPPORTED"
          ? 0.85 + Math.min(0.1, 0.02 * nodes.length)
          : status === "PARTIAL"
            ? 0.65
            : 0.35,
      status,
      inferred: nodes.length === 0,
      generatedBy: PROFILE_PARSER_VERSION,
      generatedAt: now.toISOString(),
    });
    for (const n of nodes.slice(0, 6))
      links.push({
        claimId: id,
        evidenceNodeId: n.id,
        relation: "SUPPORTS",
        strength: n.type === "REPOSITORY" ? 0.75 : 0.8,
      });
    const listed = c.evidence.find((n) => n.tags.includes("self_listed") && n.skills.includes(sk.skillKey));
    if (listed) links.push({ claimId: id, evidenceNodeId: listed.id, relation: "CONTEXT", strength: 0.3 });
  }
  return { claims, links };
}

export function candidateFromParsed(
  parsed: ParsedProfile,
  resumeText: string,
  extras: IngestExtras,
  now: Date,
  newId: (p: string) => string,
): Candidate {
  const cid = extras.id;
  const nowIso = now.toISOString();
  const resumeSource: CandidateSource = {
    id: newId("src"),
    candidateId: cid,
    sourceType: "RESUME",
    sourceUri: null,
    originalFilename: extras.sourceFilename ?? null,
    checksum: hashString(resumeText),
    text: resumeText,
    metadata: { parser: PROFILE_PARSER_VERSION, warnings: parsed.warnings },
    status: "PROCESSED",
    ingestedAt: nowIso,
  };
  const sources: CandidateSource[] = [resumeSource];
  const evidence: EvidenceNode[] = [];
  const refToId = new Map<string, string>();

  const experiences = parsed.experiences.map((e, i) => ({
    id: newId("exp"),
    candidateId: cid,
    company: e.company,
    title: e.title,
    startDate: e.startDate,
    endDate: e.endDate,
    description: "",
    bullets: e.bullets.map((b) => b.text),
    companyStage: e.companyStage,
    companySizeBand: e.companySizeBand,
    teamSize: e.teamSize,
    seniority: extras.seniorities?.[i] ?? inferSeniority(e.title),
    normalizedSkills: e.skills,
  }));
  const projects = parsed.projects.map((p, i) => ({
    id: newId("prj"),
    candidateId: cid,
    name: p.name,
    description: p.description,
    url: p.url,
    startDate: p.year
      ? new Date(Date.UTC(p.year, 0, 1)).toISOString()
      : extras.projectMeta?.[i]?.startYear
        ? new Date(Date.UTC(extras.projectMeta[i]!.startYear!, 0, 1)).toISOString()
        : null,
    endDate: null,
    solo: p.solo,
    shipped:
      extras.projectMeta?.[i]?.shipped ??
      /\b(launched|shipped|users|customers|downloads|stars|live)\b/i.test(p.description),
  }));

  for (const d of parsed.evidence) {
    const id = newId("ev");
    refToId.set(d.ref, id);
    const meta: Record<string, unknown> = { ...d.metadata };
    if (typeof d.metadata.experienceIndex === "number")
      meta.experienceId = experiences[d.metadata.experienceIndex]!.id;
    if (typeof d.metadata.projectIndex === "number") meta.projectId = projects[d.metadata.projectIndex]!.id;
    evidence.push({
      id,
      candidateId: cid,
      sourceId: resumeSource.id,
      type: d.type,
      title: d.title,
      body: d.body,
      startOffset: d.start,
      endOffset: d.end,
      sourceLocator: `resume chars ${d.start}–${d.end}`,
      observedAt: d.observedAt,
      confidence: d.type === "RESUME_FRAGMENT" && d.tags.includes("self_listed") ? 0.35 : 0.8,
      verified: false,
      skills: d.skills,
      tags: d.tags,
      metadata: meta,
      createdAt: nowIso,
    });
  }

  // ---- GitHub metadata (demo adapter: synthetic, structured exactly like the real API would be)
  if (extras.repos?.length) {
    const gh: CandidateSource = {
      id: newId("src"),
      candidateId: cid,
      sourceType: "GITHUB",
      sourceUri: extras.repos[0]!.url.split("/").slice(0, 2).join("/"),
      originalFilename: null,
      checksum: null,
      text: null,
      metadata: { adapter: "synthetic-github-v1", repos: extras.repos.length },
      status: "PROCESSED",
      ingestedAt: nowIso,
    };
    sources.push(gh);
    for (const r of extras.repos) {
      const text = `${r.name}: ${r.description} (${r.language})`;
      evidence.push({
        id: newId("ev"),
        candidateId: cid,
        sourceId: gh.id,
        type: "REPOSITORY",
        title: r.name,
        body: r.description,
        startOffset: null,
        endOffset: null,
        sourceLocator: r.url,
        observedAt: r.lastCommitAt,
        confidence: 0.75,
        verified: false,
        skills: [...new Set(extractSkillMentions(text).map((m) => m.key))],
        tags: tagText(r.description).concat(r.stars >= 50 ? ["open_source"] : []),
        metadata: { stars: r.stars, language: r.language, url: r.url },
        createdAt: nowIso,
      });
    }
  }

  // ---- skills (demonstrated + self-listed), recency from evidence dates
  const skillKeys = new Set<string>([...parsed.skillKeys, ...evidence.flatMap((n) => n.skills)]);
  const skills = [...skillKeys]
    .filter((k) => SKILL_BY_KEY[k])
    .map((k) => {
      const nodes = evidence.filter((n) => n.skills.includes(k) && !n.tags.includes("self_listed"));
      const last =
        nodes
          .map((n) => n.observedAt ?? nowIso)
          .sort()
          .pop() ?? null;
      const inferred = nodes.length === 0;
      return {
        id: newId("sk"),
        candidateId: cid,
        skillKey: k,
        displayName: SKILL_BY_KEY[k]!.display,
        proficiency: (nodes.length >= 3 ? "expert" : nodes.length >= 1 ? "proficient" : "familiar") as
          "expert" | "proficient" | "familiar",
        yearsEstimate: null,
        lastUsedAt: last,
        confidence: inferred ? 0.35 : Math.min(0.95, 0.6 + 0.1 * nodes.length),
        inferred,
      };
    });

  const prefs: CandidatePreferences = {
    workModes: null,
    openToRelocate: null,
    desiredStages: null,
    minTeamSize: null,
    maxTeamSize: null,
    domains: null,
    wantsAiWork: null,
    updatedAt: nowIso,
    sources: {},
    ...extras.preferences,
  };
  const recent = [...experiences].sort((a, b) => (a.startDate < b.startDate ? 1 : -1))[0];
  const c: Candidate = {
    id: cid,
    fullName: parsed.fullName ?? "Unnamed candidate",
    headline: parsed.headline ?? (recent ? `${recent.title} at ${recent.company}` : ""),
    email: extras.email ?? parsed.email ?? "",
    city: parsed.city,
    region: parsed.region,
    countryCode: parsed.countryCode,
    metro: parsed.metro,
    currentCompany: recent && !recent.endDate ? recent.company : null,
    currentTitle: recent && !recent.endDate ? recent.title : null,
    yearsExperience: parsed.yearsExperience,
    workAuthorization: extras.workAuthorization ?? null,
    salaryMin: extras.salaryMin ?? null,
    salaryMax: extras.salaryMin ? Math.round(extras.salaryMin * 1.15) : null,
    currency: extras.salaryMin ? "USD" : null,
    availability: extras.availability ?? null,
    profileCompleteness: 0,
    synthetic: extras.synthetic,
    experiences,
    projects,
    skills,
    preferences: prefs,
    sources,
    evidence,
    claims: [],
    claimLinks: [],
    flags: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // explicit structured fields become PROFILE_FIELD evidence so they can be cited
  const field = (name: string, title: string, body: string, tags: string[] = []) =>
    evidence.push({
      id: newId("ev"),
      candidateId: cid,
      sourceId: resumeSource.id,
      type: "PROFILE_FIELD",
      title,
      body,
      startOffset: null,
      endOffset: null,
      sourceLocator: "candidate profile",
      observedAt: nowIso,
      confidence: 0.9,
      verified: false,
      skills: [],
      tags,
      metadata: { field: name },
      createdAt: nowIso,
    });
  if (c.salaryMin)
    field(
      "compensation",
      "Compensation expectations",
      `Targeting base ≥ $${Math.round(c.salaryMin / 1000)}k`,
    );
  if (c.availability)
    field("availability", "Availability", `Availability: ${c.availability.replace("_", " ")}`);
  if (prefs.workModes || prefs.desiredStages || prefs.wantsAiWork !== null) {
    const parts = [
      prefs.workModes && `work modes: ${prefs.workModes.join(", ")}`,
      prefs.desiredStages && `stages: ${prefs.desiredStages.join(", ")}`,
      prefs.maxTeamSize && `teams ≤ ${prefs.maxTeamSize}`,
      prefs.wantsAiWork !== null && (prefs.wantsAiWork ? "wants AI product work" : "not seeking AI work"),
      prefs.openToRelocate !== null && (prefs.openToRelocate ? "open to relocation" : "not relocating"),
    ].filter(Boolean);
    field("preferences", "Stated preferences", parts.join(" · "), ["preference"]);
  }

  const { claims, links } = deriveSkillClaims(c, now, newId);
  c.claims = claims;
  c.claimLinks = links;
  for (const d of parsed.claims.filter((x) => x.claimType !== "skill")) {
    const id = newId("cl");
    c.claims.push({
      id,
      candidateId: cid,
      claimType: d.claimType,
      claimKey: d.claimKey,
      claimValue: d.claimValue,
      confidence: d.confidence,
      status: d.status,
      inferred: d.inferred,
      generatedBy: PROFILE_PARSER_VERSION,
      generatedAt: nowIso,
    });
    for (const r of d.supports)
      if (refToId.has(r))
        c.claimLinks.push({
          claimId: id,
          evidenceNodeId: refToId.get(r)!,
          relation: "SUPPORTS",
          strength: 0.75,
        });
    for (const r of d.contradicts)
      if (refToId.has(r))
        c.claimLinks.push({
          claimId: id,
          evidenceNodeId: refToId.get(r)!,
          relation: "CONTRADICTS",
          strength: 0.6,
        });
    if (d.status === "CONFLICTED")
      c.flags.push({ kind: "CONFLICT", detail: d.claimValue, sourceId: resumeSource.id });
  }

  // ---- imported profile that disagrees with the resume → surfaced conflict, never silently resolved
  if (extras.importedProfile) {
    const imp = extras.importedProfile;
    const src: CandidateSource = {
      id: newId("src"),
      candidateId: cid,
      sourceType: "IMPORT",
      sourceUri: null,
      originalFilename: null,
      checksum: null,
      text: null,
      metadata: { adapter: "profile-import (synthetic)", note: imp.note },
      status: "PROCESSED",
      ingestedAt: nowIso,
    };
    sources.push(src);
    const node: EvidenceNode = {
      id: newId("ev"),
      candidateId: cid,
      sourceId: src.id,
      type: "PROFILE_FIELD",
      title: "Imported profile",
      body: `${imp.title} at ${imp.company} — ${imp.note}`,
      startOffset: null,
      endOffset: null,
      sourceLocator: "profile import",
      observedAt: nowIso,
      confidence: 0.6,
      verified: false,
      skills: [],
      tags: [],
      metadata: { field: "imported_title" },
      createdAt: nowIso,
    };
    evidence.push(node);
    const exp = experiences.find((e) => e.company === imp.company);
    const expNode = exp
      ? evidence.find((n) => n.type === "EXPERIENCE" && n.metadata.experienceId === exp.id)
      : undefined;
    const id = newId("cl");
    c.claims.push({
      id,
      candidateId: cid,
      claimType: "experience",
      claimKey: `title_${imp.company}`,
      claimValue: `${exp?.title ?? "?"} vs ${imp.title}`,
      confidence: 0.45,
      status: "CONFLICTED",
      inferred: false,
      generatedBy: PROFILE_PARSER_VERSION,
      generatedAt: nowIso,
    });
    if (expNode)
      c.claimLinks.push({ claimId: id, evidenceNodeId: expNode.id, relation: "SUPPORTS", strength: 0.6 });
    c.claimLinks.push({ claimId: id, evidenceNodeId: node.id, relation: "CONTRADICTS", strength: 0.6 });
    c.flags.push({
      kind: "CONFLICT",
      detail: `Title at ${imp.company}: resume says “${exp?.title}”, import says “${imp.title}”`,
      sourceId: src.id,
    });
  }

  // ---- ownership / startup claims from tags
  const own = evidence.filter((n) => n.tags.includes("ownership") && n.type !== "EXPERIENCE");
  if (own.length && !c.claims.some((x) => x.claimType === "ownership")) {
    const id = newId("cl");
    c.claims.push({
      id,
      candidateId: cid,
      claimType: "ownership",
      claimKey: "end_to_end_ownership",
      claimValue: "Owns work end-to-end",
      confidence: own.length >= 2 ? 0.8 : 0.6,
      status: own.length >= 2 ? "SUPPORTED" : "PARTIAL",
      inferred: false,
      generatedBy: PROFILE_PARSER_VERSION,
      generatedAt: nowIso,
    });
    for (const n of own.slice(0, 5))
      c.claimLinks.push({ claimId: id, evidenceNodeId: n.id, relation: "SUPPORTS", strength: 0.7 });
  }

  for (const f of parsed.injectionFlags)
    c.flags.push({
      kind: "PROMPT_INJECTION",
      detail: `${f.kind}: “${f.excerpt}” — ignored, never executed`,
      sourceId: resumeSource.id,
    });
  for (const f of parsed.protectedFlags)
    c.flags.push({
      kind: "PROTECTED_ATTRIBUTE",
      detail: `${f.kind} information present — excluded from matching features`,
      sourceId: resumeSource.id,
    });

  c.profileCompleteness = computeProfileCompleteness(c);
  return c;
}
