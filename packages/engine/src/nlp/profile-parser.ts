/**
 * Profile Intelligence (spec §18.2/§18.3) — resume text → structured profile + evidence graph.
 * Tool-less, deterministic extraction. Source text is DATA: instruction-like content is flagged
 * and never acted on. Every evidence node carries exact character offsets into the source.
 */
import type { ClaimStatus, CompanyStage } from "../types";
import { SKILL_BY_KEY, extractSkillMentions } from "../text";
import { findMetros } from "../geo";
import { detectPromptInjection, detectProtectedTraits, type SafetyFlag } from "./safety";

export const TAG_PATTERNS: Record<string, RegExp> = {
  ownership:
    /\b(owned|led (?:the )?(?:design|build|development|launch|rewrite)|founding|from scratch|from (?:0|zero)\b|0\s*(?:→|->|to)\s*1|end[- ]to[- ]end|sole (?:engineer|developer|owner)|single[- ]handedly|independently|solo|as the only engineer)\b/i,
  ai_shipped:
    /\b(shipped|launched|built|deployed|released|productionized)\b[^.\n]{0,70}\b(llms?|gpt|claude|gen ?ai|ai[- ]powered|ai (?:features?|assistant|agent|copilot)|rag|embeddings|agents?|copilot)\b/i,
  customer:
    /\b(customers?|user interviews|user research|design partners|onboarded|support tickets|sales calls|talked to users)\b/i,
  leadership: /\b(managed|mentored|hired|led a team|team lead|grew the team|direct reports|managing)\b/i,
};

export function tagText(text: string): string[] {
  return Object.entries(TAG_PATTERNS)
    .filter(([, re]) => re.test(text))
    .map(([k]) => k);
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
const DATE = String.raw`(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{4}|\d{1,2}\/\d{4}|\d{4})`;
const RANGE = new RegExp(String.raw`(${DATE})\s*(?:-|–|—|to)\s*(${DATE}|present|current|now)`, "i");

function parseDate(s: string, now: Date): string | null {
  const t = s.trim().toLowerCase();
  if (/present|current|now/.test(t)) return null;
  let m = t.match(/^([a-z]+)\.?\s+(\d{4})$/);
  if (m) return new Date(Date.UTC(parseInt(m[2]!, 10), MONTHS[m[1]!.slice(0, 3)] ?? 0, 1)).toISOString();
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(parseInt(m[2]!, 10), parseInt(m[1]!, 10) - 1, 1)).toISOString();
  m = t.match(/^(\d{4})$/);
  if (m) return new Date(Date.UTC(parseInt(m[1]!, 10), 0, 1)).toISOString();
  return now.toISOString();
}

const STAGE_RE = /\b(pre-?seed|seed|series[- ]?[a-d]|growth|public|enterprise)\b/i;
const SIZE_RE = /(\d[\d,]*)\+?\s*(?:people|employees|person)/i;

function stageFrom(meta: string): CompanyStage | null {
  const m = meta.match(STAGE_RE);
  if (!m) return null;
  const s = m[1]!.toLowerCase().replace(/\s/g, "-");
  if (s.startsWith("pre")) return "pre-seed";
  if (s === "seed") return "seed";
  if (s === "series-a" || s === "seriesa") return "series-a";
  if (s.startsWith("series")) return "series-b";
  if (s === "growth") return "growth";
  return "public";
}

export function sizeBand(n: number): string {
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 1000) return "201-1000";
  if (n <= 5000) return "1001-5000";
  if (n <= 10000) return "5001-10000";
  return "10000+";
}

export interface ParsedExperience {
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  companyStage: CompanyStage | null;
  teamSize: number | null;
  companySizeBand: string | null;
  bullets: { text: string; start: number; end: number; skills: string[]; tags: string[] }[];
  start: number;
  end: number;
  skills: string[];
}

export interface ParsedProject {
  name: string;
  description: string;
  url: string | null;
  year: number | null;
  solo: boolean;
  start: number;
  end: number;
  skills: string[];
}

export interface EvidenceDraft {
  ref: string;
  type: "EXPERIENCE" | "PROJECT" | "RESUME_FRAGMENT" | "PROFILE_FIELD";
  title: string;
  body: string;
  start: number;
  end: number;
  observedAt: string | null;
  skills: string[];
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface ClaimDraft {
  claimType: "skill" | "experience" | "ownership" | "startup";
  claimKey: string;
  claimValue: string;
  status: ClaimStatus;
  confidence: number;
  inferred: boolean;
  supports: string[]; // evidence refs
  contradicts: string[];
}

export interface ParsedProfile {
  fullName: string | null;
  headline: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  metro: string | null;
  experiences: ParsedExperience[];
  projects: ParsedProject[];
  skillKeys: string[];
  skillsSectionOnly: string[];
  yearsExperience: number;
  claimedYears: number | null;
  evidence: EvidenceDraft[];
  claims: ClaimDraft[];
  injectionFlags: SafetyFlag[];
  protectedFlags: SafetyFlag[];
  warnings: string[];
}

interface Line {
  text: string;
  start: number;
  end: number;
}

function lines(text: string): Line[] {
  const out: Line[] = [];
  let pos = 0;
  for (const raw of text.split("\n")) {
    const lead = raw.length - raw.trimStart().length;
    out.push({ text: raw.trim(), start: pos + lead, end: pos + lead + raw.trim().length });
    pos += raw.length + 1;
  }
  return out;
}

const SECTION =
  /^(summary|profile|about|experience|work experience|employment|work history|projects?|selected projects|open source|skills|technical skills|education|certifications?)\s*:?\s*$/i;

function sectionName(s: string): string {
  const t = s.toLowerCase();
  if (/experience|employment|history/.test(t)) return "experience";
  if (/project|open source/.test(t)) return "projects";
  if (/skill/.test(t)) return "skills";
  if (/education|certif/.test(t)) return "education";
  return "summary";
}

function splitHeader(header: string): { title: string; company: string; meta: string } {
  const noDates = header
    .replace(RANGE, "")
    .replace(/[|·,(\s]+$/, "")
    .trim();
  let title = noDates;
  let company = "";
  let meta = "";
  const paren = noDates.match(/\(([^)]*)\)/);
  if (paren) meta = paren[1]!;
  const clean = noDates
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+\|\s*$/, "")
    .trim();
  const parts = clean.split(/\s+[—–]\s+|\s+-\s+|\s+@\s+|\s+at\s+|\s*\|\s*/);
  if (parts.length >= 2) {
    title = parts[0]!.trim();
    company = parts[1]!.trim();
    if (parts[2]) meta = `${meta} ${parts.slice(2).join(" ")}`.trim();
  }
  return { title, company, meta };
}

export function parseResume(text: string, now: Date): ParsedProfile {
  const ls = lines(text);
  const evidence: EvidenceDraft[] = [];
  const warnings: string[] = [];
  const nonEmpty = ls.filter((l) => l.text);
  const head = nonEmpty.slice(0, 4);

  const fullName =
    nonEmpty[0] && nonEmpty[0].text.split(/\s+/).length <= 5 && !/[@\d|]/.test(nonEmpty[0].text)
      ? nonEmpty[0].text
      : null;
  const headline =
    nonEmpty[1] && !SECTION.test(nonEmpty[1].text) && !/@/.test(nonEmpty[1].text) ? nonEmpty[1].text : null;
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
  let metro: ReturnType<typeof findMetros>[number] | undefined;
  for (const l of head) {
    const m = findMetros(l.text)[0];
    if (m) {
      metro = { ...m, start: m.start + l.start, end: m.end + l.start };
      evidence.push({
        ref: "loc",
        type: "PROFILE_FIELD",
        title: "Location",
        body: l.text,
        start: l.start,
        end: l.end,
        observedAt: now.toISOString(),
        skills: [],
        tags: [],
        metadata: { field: "location" },
      });
      break;
    }
  }

  // ---- sections
  let section = "summary";
  const experiences: ParsedExperience[] = [];
  const projects: ParsedProject[] = [];
  let skillsSection: Line[] = [];
  let summaryText = "";
  let current: ParsedExperience | null = null;
  let currentProject: ParsedProject | null = null;
  for (const l of ls.slice(fullName ? 1 : 0)) {
    if (!l.text) continue;
    if (SECTION.test(l.text)) {
      section = sectionName(l.text);
      current = null;
      currentProject = null;
      continue;
    }
    const isBullet = /^[-•*▪◦]\s+/.test(l.text);
    if (section === "experience") {
      const range = l.text.match(RANGE);
      if (!isBullet && range) {
        const { title, company, meta } = splitHeader(l.text);
        const sizeM = meta.match(SIZE_RE);
        const team = sizeM ? parseInt(sizeM[1]!.replace(/,/g, ""), 10) : null;
        current = {
          title,
          company,
          startDate: parseDate(range[1]!, now)!,
          endDate: parseDate(range[2]!, now),
          companyStage: stageFrom(meta),
          teamSize: team,
          companySizeBand: team !== null ? sizeBand(team) : null,
          bullets: [],
          start: l.start,
          end: l.end,
          skills: [],
        };
        experiences.push(current);
      } else if (current && (isBullet || l.text.length > 30)) {
        const bt = l.text.replace(/^[-•*▪◦]\s+/, "");
        const off = l.start + (l.text.length - bt.length);
        const skills = [...new Set(extractSkillMentions(bt).map((m) => m.key))];
        current.bullets.push({ text: bt, start: off, end: off + bt.length, skills, tags: tagText(bt) });
        current.end = l.end;
        for (const s of skills) if (!current.skills.includes(s)) current.skills.push(s);
      }
    } else if (section === "projects") {
      if (!isBullet) {
        const name = l.text.split(/\s+[—–-]\s+|:\s+/)[0]!.trim();
        const url =
          l.text.match(/\b(?:https?:\/\/)?(?:github\.com|[\w-]+\.(?:dev|io|app|com))\/?[\w./-]*/i)?.[0] ??
          null;
        const year = l.text.match(/\b(20\d{2})\b/);
        currentProject = {
          name,
          description: l.text.slice(name.length).replace(/^\s*[—–:-]\s*/, ""),
          url,
          year: year ? parseInt(year[1]!, 10) : null,
          solo: /\b(solo|independent|side project|built alone|indie)\b/i.test(l.text),
          start: l.start,
          end: l.end,
          skills: [],
        };
        projects.push(currentProject);
      } else if (currentProject) {
        const bt = l.text.replace(/^[-•*▪◦]\s+/, "");
        currentProject.description += (currentProject.description ? " " : "") + bt;
        currentProject.end = l.end;
        if (/\b(solo|independently|by myself|single[- ]handedly)\b/i.test(bt)) currentProject.solo = true;
      }
      if (currentProject)
        currentProject.skills = [
          ...new Set(
            extractSkillMentions(text.slice(currentProject.start, currentProject.end)).map((m) => m.key),
          ),
        ];
    } else if (section === "skills") {
      skillsSection.push(l);
    } else if (section === "summary") {
      summaryText += ` ${l.text}`;
    }
  }

  // ---- evidence nodes
  experiences.forEach((e, i) => {
    const ref = `exp${i}`;
    evidence.push({
      ref,
      type: "EXPERIENCE",
      title: `${e.title}${e.company ? ` at ${e.company}` : ""}`,
      body: text.slice(e.start, e.end),
      start: e.start,
      end: e.end,
      observedAt: e.endDate ?? now.toISOString(),
      skills: e.skills,
      tags: [...new Set(e.bullets.flatMap((b) => b.tags))],
      metadata: { experienceIndex: i },
    });
    e.bullets.forEach((b, j) => {
      if (!b.skills.length && !b.tags.length) return;
      evidence.push({
        ref: `${ref}.b${j}`,
        type: "RESUME_FRAGMENT",
        title: `${e.company}: ${b.text.length > 46 ? `${b.text.slice(0, 45).trimEnd()}…` : b.text}`,
        body: b.text,
        start: b.start,
        end: b.end,
        observedAt: e.endDate ?? now.toISOString(),
        skills: b.skills,
        tags: b.tags,
        metadata: { experienceIndex: i },
      });
    });
  });
  projects.forEach((p, i) => {
    evidence.push({
      ref: `proj${i}`,
      type: "PROJECT",
      title: p.name,
      body: text.slice(p.start, p.end),
      start: p.start,
      end: p.end,
      observedAt: p.year ? new Date(Date.UTC(p.year, 6, 1)).toISOString() : null,
      skills: p.skills,
      tags: tagText(p.description).concat(p.solo ? ["ownership"] : []),
      metadata: { projectIndex: i, url: p.url },
    });
  });

  // ---- skills & claims
  const evidenced = new Map<string, string[]>();
  for (const n of evidence) {
    if (n.type === "PROFILE_FIELD") continue;
    if (n.type === "EXPERIENCE") continue; // bullets carry the fine-grained support
    for (const s of n.skills) evidenced.set(s, [...(evidenced.get(s) ?? []), n.ref]);
  }
  for (const n of evidence.filter((x) => x.type === "EXPERIENCE"))
    for (const s of n.skills) if (!evidenced.has(s)) evidenced.set(s, [n.ref]);
  const skillsText = skillsSection.map((l) => l.text).join(", ");
  const listed = new Set(extractSkillMentions(skillsText).map((m) => m.key));
  const summarySkills = new Set(extractSkillMentions(summaryText).map((m) => m.key));
  if (skillsSection.length) {
    const first = skillsSection[0]!;
    const last = skillsSection[skillsSection.length - 1]!;
    evidence.push({
      ref: "skills",
      type: "RESUME_FRAGMENT",
      title: "Skills section (self-listed)",
      body: text.slice(first.start, last.end),
      start: first.start,
      end: last.end,
      observedAt: now.toISOString(),
      skills: [...listed],
      tags: ["self_listed"],
      metadata: {},
    });
  }
  const claims: ClaimDraft[] = [];
  const allSkills = new Set([...evidenced.keys(), ...listed, ...summarySkills]);
  for (const key of allSkills) {
    const refs = evidenced.get(key) ?? [];
    const status: ClaimStatus =
      refs.length >= 2 ? "SUPPORTED" : refs.length === 1 ? "PARTIAL" : "UNSUPPORTED";
    claims.push({
      claimType: "skill",
      claimKey: key,
      claimValue: SKILL_BY_KEY[key]?.display ?? key,
      status,
      confidence: refs.length >= 2 ? 0.85 : refs.length ? 0.65 : 0.35,
      inferred: refs.length === 0,
      supports: refs.length ? refs : listed.has(key) ? ["skills"] : [],
      contradicts: [],
    });
  }
  const own = evidence.filter((n) => n.tags.includes("ownership") && n.type !== "EXPERIENCE");
  if (own.length)
    claims.push({
      claimType: "ownership",
      claimKey: "end_to_end_ownership",
      claimValue: "Owns work end-to-end",
      status: own.length >= 2 ? "SUPPORTED" : "PARTIAL",
      confidence: own.length >= 2 ? 0.8 : 0.6,
      inferred: false,
      supports: own.map((n) => n.ref),
      contradicts: [],
    });
  const early = experiences
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => ["pre-seed", "seed", "series-a"].includes(e.companyStage ?? ""));
  if (early.length)
    claims.push({
      claimType: "startup",
      claimKey: "early_stage",
      claimValue: "Early-stage startup experience",
      status: early.length >= 2 ? "SUPPORTED" : "PARTIAL",
      confidence: 0.75,
      inferred: false,
      supports: early.map(({ i }) => `exp${i}`),
      contradicts: [],
    });

  // ---- years + conflict detection
  const intervals = experiences
    .map(
      (e) =>
        [new Date(e.startDate).getTime(), e.endDate ? new Date(e.endDate).getTime() : now.getTime()] as [
          number,
          number,
        ],
    )
    .sort((a, b) => a[0] - b[0]);
  let years = 0;
  let cur: [number, number] | null = null;
  for (const iv of intervals) {
    if (!cur) cur = [...iv];
    else if (iv[0] <= cur[1]) cur[1] = Math.max(cur[1], iv[1]);
    else {
      years += cur[1] - cur[0];
      cur = [...iv];
    }
  }
  if (cur) years += cur[1] - cur[0];
  const yearsExperience = Math.round((years / 3.156e10) * 10) / 10;
  const claimedM = summaryText.match(/(\d{1,2})\+?\s*years/i);
  const claimedYears = claimedM ? parseInt(claimedM[1]!, 10) : null;
  if (claimedYears !== null && Math.abs(claimedYears - yearsExperience) >= 3) {
    claims.push({
      claimType: "experience",
      claimKey: "years",
      claimValue: `${claimedYears} years (summary) vs ${yearsExperience} years (dated roles)`,
      status: "CONFLICTED",
      confidence: 0.4,
      inferred: false,
      supports: [],
      contradicts: experiences.map((_, i) => `exp${i}`),
    });
    warnings.push(`Summary claims ${claimedYears} years but dated roles add up to ${yearsExperience}.`);
  }
  for (let i = 0; i < experiences.length; i++) {
    for (let j = i + 1; j < experiences.length; j++) {
      const a = experiences[i]!;
      const b = experiences[j]!;
      const overlap =
        Math.min(a.endDate ? +new Date(a.endDate) : +now, b.endDate ? +new Date(b.endDate) : +now) -
        Math.max(+new Date(a.startDate), +new Date(b.startDate));
      if (overlap > 2.6e10 && a.company !== b.company) {
        claims.push({
          claimType: "experience",
          claimKey: `overlap_${i}_${j}`,
          claimValue: `${a.title} at ${a.company} vs ${b.title} at ${b.company}`,
          status: "CONFLICTED",
          confidence: 0.45,
          inferred: false,
          supports: [],
          contradicts: [`exp${i}`, `exp${j}`],
        });
        warnings.push(`Overlapping full-time roles: ${a.company} and ${b.company}.`);
      }
    }
  }

  const injectionFlags = detectPromptInjection(text);
  const protectedFlags = detectProtectedTraits(text);
  if (injectionFlags.length)
    warnings.push(
      `Instruction-like text found and ignored (${injectionFlags.map((f) => f.kind).join(", ")}).`,
    );
  if (protectedFlags.length)
    warnings.push(
      `Protected-attribute content detected (${[...new Set(protectedFlags.map((f) => f.kind))].join(", ")}) — excluded from matching.`,
    );
  if (!experiences.length)
    warnings.push(
      "No dated work experience found — expected lines like “Title — Company | Jan 2021 – Present”.",
    );

  return {
    fullName,
    headline,
    email,
    city: metro?.metro.city ?? null,
    region: metro?.metro.region ?? null,
    countryCode: metro?.metro.countryCode ?? null,
    metro: metro?.metro.key ?? null,
    experiences,
    projects,
    skillKeys: [...allSkills],
    skillsSectionOnly: [...listed].filter((k) => !evidenced.has(k)),
    yearsExperience,
    claimedYears,
    evidence,
    claims,
    injectionFlags,
    protectedFlags,
    warnings,
  };
}
