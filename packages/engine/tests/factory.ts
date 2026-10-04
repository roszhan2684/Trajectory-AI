import type { Candidate, CandidateExperience, EvidenceNode, JobRole, RoleRequirement } from "../src/types";
import { extractSkillMentions, SKILL_BY_KEY } from "../src/text";
import { tagText } from "../src/nlp/profile-parser";
import { IMPORTANCE_WEIGHT } from "../src/scoring/config";

export const NOW = new Date("2026-10-01T12:00:00Z");
let seq = 0;
const id = (p: string) => `${p}_${++seq}`;

export function makeRole(
  over: Partial<JobRole> = {},
  reqs: [string, "MUST" | "STRONG" | "NICE"][] = [
    ["typescript", "MUST"],
    ["react", "MUST"],
    ["llm", "STRONG"],
    ["search", "NICE"],
  ],
): { role: JobRole; reqs: RoleRequirement[] } {
  const role: JobRole = {
    id: id("role"),
    organizationId: "org_1",
    title: "Founding Full-Stack AI Engineer",
    status: "ACTIVE",
    descriptionRaw: "Founding full-stack engineer building LLM product features with TypeScript and React.",
    descriptionNormalized:
      "Founding full-stack engineer building LLM product features with TypeScript and React. Own features end-to-end.",
    responsibilities: ["Own product features end-to-end", "Ship LLM features"],
    locationMode: "ONSITE",
    city: "San Francisco",
    region: "CA",
    countryCode: "US",
    minComp: 170000,
    maxComp: 220000,
    currency: "USD",
    visaSupport: "NO",
    employmentType: "FULL_TIME",
    minYears: 3,
    maxYears: 10,
    companyStage: "seed",
    teamSize: 9,
    domain: null,
    scoringOverrides: null,
    parse: null,
    createdByUserId: "u1",
    activatedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
  const r: RoleRequirement[] = reqs.map(([key, imp]) => ({
    id: id("req"),
    roleId: role.id,
    category: "SKILL",
    label: SKILL_BY_KEY[key]!.display,
    normalizedKey: key,
    importance: imp,
    weight: IMPORTANCE_WEIGHT[imp],
    sourceText: key,
    confidence: 0.9,
    isHardConstraint: false,
  }));
  return { role, reqs: r };
}

interface ExpSpec {
  title: string;
  company: string;
  start: string;
  end: string | null;
  stage: CandidateExperience["companyStage"];
  band: string;
  team: number;
  bullets: string[];
  seniority?: number;
}

export function makeCandidate(over: Partial<Candidate> = {}, exps: ExpSpec[] = []): Candidate {
  const cid = over.id ?? id("cand");
  const c: Candidate = {
    id: cid,
    fullName: "Test Person",
    headline: "Engineer",
    email: "t@example.com",
    city: "San Francisco",
    region: "CA",
    countryCode: "US",
    metro: "sf_bay",
    currentCompany: null,
    currentTitle: null,
    yearsExperience: 5,
    workAuthorization: "citizen",
    salaryMin: 180000,
    salaryMax: 210000,
    currency: "USD",
    availability: "1_month",
    profileCompleteness: 0.7,
    synthetic: true,
    experiences: [],
    projects: [],
    skills: [],
    preferences: {
      workModes: ["onsite", "hybrid"],
      openToRelocate: null,
      desiredStages: ["seed"],
      minTeamSize: null,
      maxTeamSize: 30,
      domains: null,
      wantsAiWork: true,
      updatedAt: NOW.toISOString(),
      sources: {},
    },
    sources: [],
    evidence: [],
    claims: [],
    claimLinks: [],
    flags: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...over,
  };
  const skillNodes = new Map<string, string[]>();
  for (const e of exps) {
    const eid = id("exp");
    const skills = [...new Set(e.bullets.flatMap((b) => extractSkillMentions(b).map((m) => m.key)))];
    c.experiences.push({
      id: eid,
      candidateId: cid,
      company: e.company,
      title: e.title,
      startDate: e.start,
      endDate: e.end,
      description: "",
      bullets: e.bullets,
      companyStage: e.stage,
      companySizeBand: e.band,
      teamSize: e.team,
      seniority: e.seniority ?? 3,
      normalizedSkills: skills,
    });
    const node: EvidenceNode = {
      id: id("ev"),
      candidateId: cid,
      sourceId: null,
      type: "EXPERIENCE",
      title: `${e.title} at ${e.company}`,
      body: e.bullets.join(" "),
      startOffset: null,
      endOffset: null,
      sourceLocator: null,
      observedAt: e.end ?? NOW.toISOString(),
      confidence: 0.8,
      verified: false,
      skills,
      tags: [...new Set(e.bullets.flatMap(tagText))],
      metadata: { experienceId: eid },
      createdAt: NOW.toISOString(),
    };
    c.evidence.push(node);
    for (const b of e.bullets) {
      const bs = [...new Set(extractSkillMentions(b).map((m) => m.key))];
      const bn: EvidenceNode = {
        ...node,
        id: id("ev"),
        type: "RESUME_FRAGMENT",
        body: b,
        skills: bs,
        tags: tagText(b),
        metadata: { experienceId: eid },
      };
      c.evidence.push(bn);
      for (const s of bs) skillNodes.set(s, [...(skillNodes.get(s) ?? []), bn.id]);
    }
  }
  for (const [key, nodes] of skillNodes) {
    c.skills.push({
      id: id("sk"),
      candidateId: cid,
      skillKey: key,
      displayName: SKILL_BY_KEY[key]!.display,
      proficiency: "proficient",
      yearsEstimate: null,
      lastUsedAt: NOW.toISOString(),
      confidence: 0.8,
      inferred: false,
    });
    const clId = id("cl");
    c.claims.push({
      id: clId,
      candidateId: cid,
      claimType: "skill",
      claimKey: key,
      claimValue: SKILL_BY_KEY[key]!.display,
      confidence: 0.85,
      status: nodes.length >= 2 ? "SUPPORTED" : "PARTIAL",
      inferred: false,
      generatedBy: "test",
      generatedAt: NOW.toISOString(),
    });
    for (const n of nodes)
      c.claimLinks.push({ claimId: clId, evidenceNodeId: n, relation: "SUPPORTS", strength: 0.8 });
  }
  return c;
}

export const STARTUP_ENGINEER: ExpSpec[] = [
  {
    title: "Founding Engineer",
    company: "Brightloop",
    start: "2023-02-01T00:00:00Z",
    end: null,
    stage: "seed",
    band: "1-10",
    team: 8,
    bullets: [
      "Built the product end-to-end in TypeScript and React with Next.js",
      "Shipped LLM features using RAG and embeddings to 4,000 users",
      "Owned Postgres schema and background jobs",
    ],
  },
  {
    title: "Software Engineer",
    company: "Kitewire",
    start: "2020-06-01T00:00:00Z",
    end: "2023-01-01T00:00:00Z",
    stage: "series-a",
    band: "11-50",
    team: 30,
    bullets: [
      "Developed React and TypeScript dashboards",
      "Led the rewrite of the billing service in Node.js",
    ],
  },
];

export const ENTERPRISE_ENGINEER: ExpSpec[] = [
  {
    title: "Senior Software Engineer",
    company: "Glacier Cloud",
    start: "2018-01-01T00:00:00Z",
    end: null,
    stage: "public",
    band: "10000+",
    team: 4000,
    bullets: [
      "Developed TypeScript and React features for the enterprise console",
      "Worked on Elasticsearch search ranking for internal tools",
    ],
    seniority: 4,
  },
  {
    title: "Software Engineer",
    company: "Northwind Payments",
    start: "2015-01-01T00:00:00Z",
    end: "2017-12-01T00:00:00Z",
    stage: "growth",
    band: "1001-5000",
    team: 1200,
    bullets: ["Built Java microservices"],
  },
];
