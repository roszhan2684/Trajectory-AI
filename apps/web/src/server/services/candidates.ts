/** CandidateService — ingestion (job), profile reads, synthetic GitHub import, PII deletion. */
import {
  DomainError,
  candidateFromParsed,
  deriveSkillClaims,
  hashString,
  parseResume,
  type Candidate,
  type RepoMeta,
} from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import { MAX_UPLOAD_BYTES, resumeInput } from "../validation";
import { audit, now, requireCap, track, type Actor } from "./core";
import { indexCandidate, invalidateCandidate, markStale, removeFromIndex } from "./search";
import { enqueue, PermanentError } from "./jobs";
import { clock } from "./matches";

/** Pure ingestion core (no runner): text → parsed profile → candidate with evidence graph. */
export function ingestResumeText(
  text: string,
  filename: string | null,
  extras: Partial<Parameters<typeof candidateFromParsed>[2]> = {},
): Candidate {
  const db = getDB();
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n");
  const parsed = parseResume(normalized, clock());
  if (!parsed.experiences.length && !parsed.skillKeys.length) {
    throw new PermanentError(
      "Couldn't find work experience or skills in this document. Paste a resume with dated roles like “Engineer — Company | Jan 2021 – Present”.",
    );
  }
  const c = candidateFromParsed(
    parsed,
    normalized,
    { id: extras.id ?? nextId(db, "cand"), synthetic: false, sourceFilename: filename, ...extras },
    clock(),
    (p) => nextId(db, p),
  );
  return c;
}

export async function ingestCandidate(actor: Actor, raw: unknown) {
  requireCap(actor, "candidates.ingest");
  const { text, filename } = resumeInput.parse(raw);
  const checksum = hashString(text);
  const db = getDB();
  const dupe = db.candidates.find((c) => c.sources.some((s) => s.checksum === checksum));
  if (dupe) return { job: null, candidateId: dupe.id, duplicate: true };
  const { job } = await enqueue({
    type: "ingest-candidate-source",
    idempotencyKey: `ingest:${checksum}`,
    organizationId: actor.org.id,
    userId: actor.user.id,
    payload: { filename, bytes: text.length },
    steps: [
      "Normalize text",
      "Extract structure (Profile Intelligence)",
      "Build evidence graph & claims",
      "Persist candidate",
      "Index candidate",
    ],
    maxAttempts: 2,
    task: async (ctx) => {
      await ctx.step(
        "Normalize text",
        () => text.length,
        (n) => `${n.toLocaleString()} characters; source treated as untrusted data`,
      );
      const parsed = await ctx.step(
        "Extract structure (Profile Intelligence)",
        () => parseResume(text, clock()),
        (p) =>
          `${p.experiences.length} roles, ${p.projects.length} projects, ${p.skillKeys.length} skills${p.injectionFlags.length ? `, ${p.injectionFlags.length} injection attempt(s) flagged` : ""}`,
      );
      if (!parsed.experiences.length && !parsed.skillKeys.length)
        throw new PermanentError("No work experience or skills found — unsupported document format.");
      const c = await ctx.step(
        "Build evidence graph & claims",
        () => ingestResumeText(text, filename),
        (x) =>
          `${x.evidence.length} evidence nodes, ${x.claims.length} claims, ${x.claims.filter((cl) => cl.status === "CONFLICTED").length} conflicts`,
      );
      await ctx.step("Persist candidate", () => {
        getDB().candidates.push(c);
        markStale(c);
        persist();
        return c.id;
      });
      await ctx.step(
        "Index candidate",
        () => indexCandidate(c),
        (r) => `upserted into candidates_v1 (hash ${r.hash})`,
      );
      audit(actor, "candidate.ingested", "candidate", c.id, { filename, evidence: c.evidence.length });
      track(actor, "candidate_ingested", { evidence: c.evidence.length, flags: c.flags.length });
      return { candidateId: c.id };
    },
  });
  return { job, candidateId: null, duplicate: false };
}

/** Server-side PDF text extraction with type + size limits. */
export async function extractPdfText(bytes: Uint8Array, mime: string): Promise<string> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new DomainError("VALIDATION", "File is larger than 5 MB.");
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  if (mime !== "application/pdf" || magic !== "%PDF-")
    throw new DomainError("VALIDATION", "Only PDF files (or pasted text) are supported.");
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const out = Array.isArray(text) ? text.join("\n") : text;
  if (out.trim().length < 80)
    throw new DomainError("VALIDATION", "That PDF has no extractable text (is it a scanned image?).");
  return out;
}

export function getCandidate(actor: Actor, id: string) {
  requireCap(actor, "candidates.search");
  const db = getDB();
  const c = db.candidates.find((x) => x.id === id);
  if (!c) throw new DomainError("NOT_FOUND", "Candidate not found.");
  const orgRoles = new Set(db.roles.filter((r) => r.organizationId === actor.org.id).map((r) => r.id));
  const matches = db.matches
    .filter((m) => m.candidateId === id && orgRoles.has(m.roleId) && m.rank !== 0)
    .map((m) => ({ match: m, role: db.roles.find((r) => r.id === m.roleId)! }));
  return {
    candidate: c,
    matches: matches.sort((a, b) => b.match.finalScore - a.match.finalScore),
    indexState: db.indexState.find((s) => s.entityId === id) ?? null,
    conversations: db.conversations.filter(
      (cv) => cv.candidateId === id && cv.organizationId === actor.org.id,
    ),
  };
}

/** Demo GitHub adapter: deterministic synthetic metadata shaped like the GitHub REST API. */
export function syntheticGithubRepos(handle: string, c: Candidate): RepoMeta[] {
  const h = parseInt(hashString(handle), 16);
  const langs = c.skills
    .filter((s) => ["typescript", "python", "go", "rust", "javascript", "swift", "cpp"].includes(s.skillKey))
    .map((s) => s.displayName);
  const topics = c.skills.slice(0, 6).map((s) => s.displayName);
  return [0, 1, 2].slice(0, 1 + (h % 3)).map((i) => ({
    name: `${handle}-${["toolkit", "playground", "experiments"][i]}`,
    description: `${["Utilities", "Experiments", "Prototypes"][i]} with ${topics.slice(i, i + 3).join(", ") || "side projects"}`,
    language: langs[i % Math.max(1, langs.length)] ?? "TypeScript",
    stars: (h >> (i * 4)) % 260,
    lastCommitAt: new Date(Date.UTC(2026, (h >> i) % 9, 1 + i * 7)).toISOString(),
    url: `github.com/${handle}/${handle}-${["toolkit", "playground", "experiments"][i]}`,
  }));
}

export function importGithub(actor: Actor, candidateId: string, handle: string) {
  requireCap(actor, "candidates.ingest");
  if (!/^[a-z0-9-]{1,39}$/i.test(handle))
    throw new DomainError("VALIDATION", "That doesn't look like a GitHub username.");
  const db = getDB();
  const c = db.candidates.find((x) => x.id === candidateId);
  if (!c) throw new DomainError("NOT_FOUND", "Candidate not found.");
  if (c.sources.some((s) => s.sourceType === "GITHUB"))
    throw new DomainError("CONFLICT", "GitHub metadata is already linked for this candidate.");
  const ts = now().toISOString();
  const src = {
    id: nextId(db, "src"),
    candidateId: c.id,
    sourceType: "GITHUB" as const,
    sourceUri: `github.com/${handle}`,
    originalFilename: null,
    checksum: null,
    text: null,
    metadata: { adapter: "synthetic-github-v1", note: "Demo adapter — replace with GitHub OAuth/API" },
    status: "PROCESSED" as const,
    ingestedAt: ts,
  };
  c.sources.push(src);
  for (const r of syntheticGithubRepos(handle, c)) {
    c.evidence.push({
      id: nextId(db, "ev"),
      candidateId: c.id,
      sourceId: src.id,
      type: "REPOSITORY",
      title: r.name,
      body: r.description,
      startOffset: null,
      endOffset: null,
      sourceLocator: r.url,
      observedAt: r.lastCommitAt,
      confidence: 0.7,
      verified: false,
      skills: c.skills.filter((s) => r.description.includes(s.displayName)).map((s) => s.skillKey),
      tags: r.stars >= 50 ? ["open_source"] : [],
      metadata: { stars: r.stars, language: r.language, url: r.url },
      createdAt: ts,
    });
  }
  const { claims, links } = deriveSkillClaims(c, clock(), (p) => nextId(db, p));
  const nonSkill = c.claims.filter((cl) => cl.claimType !== "skill");
  const nonSkillIds = new Set(nonSkill.map((cl) => cl.id));
  c.claims = [...claims, ...nonSkill];
  c.claimLinks = [...links, ...c.claimLinks.filter((l) => nonSkillIds.has(l.claimId))];
  c.updatedAt = ts;
  invalidateCandidate(c.id);
  indexCandidate(c);
  audit(actor, "candidate.github_imported", "candidate", c.id, {
    repos: c.evidence.filter((n) => n.sourceId === src.id).length,
  });
  persist();
  return c;
}

/** Deletion pathway for candidate data (spec §24.2). */
export function deleteCandidate(actor: Actor, id: string) {
  requireCap(actor, "org.manage");
  const db = getDB();
  const c = db.candidates.find((x) => x.id === id);
  if (!c) throw new DomainError("NOT_FOUND", "Candidate not found.");
  db.candidates = db.candidates.filter((x) => x.id !== id);
  db.matches = db.matches.filter((m) => m.candidateId !== id);
  db.conversations = db.conversations.filter((x) => x.candidateId !== id);
  db.introductions = db.introductions.filter((x) => x.candidateId !== id);
  db.latent = db.latent.filter((x) => x.candidateId !== id);
  db.evalCases = db.evalCases.filter((x) => x.candidateId !== id);
  removeFromIndex(id);
  audit(actor, "candidate.deleted", "candidate", id, { name_hash: hashString(c.fullName) });
  persist();
}
