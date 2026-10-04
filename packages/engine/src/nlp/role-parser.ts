/**
 * Role Intelligence (spec §18.1) — messy brief → structured, editable role proposal.
 * Deterministic NLP (skill taxonomy + cue lexicons + pattern extraction), with per-field
 * confidence and source snippets. Nothing here activates a role; a human approves it.
 */
import type {
  Ambiguity,
  CompanyStage,
  Importance,
  LocationMode,
  RequirementCategory,
  TriState,
} from "../types";
import { SKILL_BY_KEY, extractSkillMentions, yearsRequired } from "../text";
import { findMetros } from "../geo";
import { IMPORTANCE_WEIGHT, PARSER_VERSION } from "../scoring/config";
import { detectPromptInjection, detectProtectedTraits } from "./safety";

export interface Field<T> {
  value: T;
  confidence: number;
  source: string | null;
}

export interface ParsedRequirement {
  category: RequirementCategory;
  label: string;
  normalizedKey: string;
  importance: Importance;
  weight: number;
  sourceText: string;
  confidence: number;
  isHardConstraint: boolean;
}

export interface RoleProposal {
  parserVersion: string;
  title: Field<string>;
  locationMode: Field<LocationMode>;
  city: Field<string | null>;
  region: Field<string | null>;
  countryCode: Field<string>;
  minComp: Field<number | null>;
  maxComp: Field<number | null>;
  currency: Field<string | null>;
  visaSupport: Field<TriState>;
  minYears: Field<number | null>;
  maxYears: Field<number | null>;
  companyStage: Field<CompanyStage>;
  teamSize: Field<number | null>;
  employmentType: Field<string>;
  domain: Field<string | null>;
  responsibilities: string[];
  requirements: ParsedRequirement[];
  ambiguities: Ambiguity[];
  protectedTraitWarnings: string[];
  injectionFlags: string[];
  descriptionNormalized: string;
}

export interface OrgContext {
  stage: CompanyStage;
  countryCode: string;
  sizeBand?: string;
  industry?: string;
}

const MUST_CUES =
  /\b(must|required|requirement|need(?:s)? (?:to )?(?:have|be)?|essential|non[- ]negotiable|strong|deep|expert|proven|solid)\b/i;
const NICE_CUES =
  /\b(bonus|nice[- ]to[- ]have|a plus|plus if|big plus|extra credit|ideally also|would be great)\b/i;
const STRONG_CUES =
  /\b(should|ideally|preferably|comfortable|familiar|experience with|has shipped|have shipped|track record)\b/i;

const WORK_STYLE: { re: RegExp; label: string; key: string; category: RequirementCategory }[] = [
  {
    re: /\bown(?:s|ing)?\b[^.,;]{0,30}\bend[- ]to[- ]end\b|\bend[- ]to[- ]end ownership\b|\bfull ownership\b|\bhigh[- ]agency\b/i,
    label: "End-to-end product ownership",
    key: "ownership",
    category: "WORK_STYLE",
  },
  {
    re: /\b(tiny|small|lean|scrappy|fast[- ]moving)\b[^.,;]{0,25}\bteam\b|\bearly[- ]stage\b|\bstartup experience\b/i,
    label: "Thrives in a small, fast-moving team",
    key: "small_team",
    category: "WORK_STYLE",
  },
  {
    re: /\bship(?:ped|s)?\b[^.,;]{0,25}\b(llm|ai|gen ?ai|ml)\b[^.,;]{0,15}\b(features?|products?)\b|\b(llm|ai) features? (?:in|to) production\b/i,
    label: "Shipped LLM/AI features to production",
    key: "ai_shipped",
    category: "EXPERIENCE",
  },
  {
    re: /\b(customer[- ]facing|talk(?:s|ing)? to (?:customers|users)|user research|customer discovery)\b/i,
    label: "Comfortable working directly with customers",
    key: "customer_facing",
    category: "WORK_STYLE",
  },
  {
    re: /\b(mentor(?:ing)?|lead(?:ing)? (?:a )?team|people management|manage (?:a )?team)\b/i,
    label: "Leadership / mentoring",
    key: "leadership",
    category: "EXPERIENCE",
  },
  {
    re: /\b(0|zero)\s*(?:to|→|->)\s*(1|one)\b/i,
    label: "0→1 product building",
    key: "zero_to_one",
    category: "EXPERIENCE",
  },
];

const DOMAINS: [RegExp, string][] = [
  [/\b(health(?:care)?|clinical|patients?|hipaa)\b/i, "healthcare"],
  [/\b(fintech|payments?|banking|lending)\b/i, "fintech"],
  [/\b(robot(?:s|ics)?|autonomy|hardware)\b/i, "robotics"],
  [/\b(recruiting|talent|hiring platform|hr tech)\b/i, "recruiting"],
  [/\b(developer tools?|devtools|infrastructure)\b/i, "devtools"],
  [/\b(climate|energy|carbon)\b/i, "climate"],
];

const TITLE_RE =
  /\b(?:hiring|need|needs|looking for|seeking|want|wants|searching for|recruiting)\s+(?:a|an|our|the)?\s*((?:first|founding|senior|staff|lead|principal|junior|mid[- ]level|head of)?\s*(?:[a-z0-9+./-]+\s){0,3}?(?:engineer|developer|designer|scientist|manager|lead|recruiter|executive|architect|analyst|marketer|researcher|advocate))\b/i;

function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) =>
      /^(ai|ml|ux|ui|ios|qa|api|llm|sre|gtm|ae)$/i.test(w)
        ? w.toUpperCase()
        : w
            .split("-")
            .map((p) => (p ? p[0]!.toUpperCase() + p.slice(1).toLowerCase() : p))
            .join("-"),
    )
    .join(" ");
}

/** Split on sentence punctuation only when followed by whitespace/end ("Next.js" stays intact). */
function sentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^\n]+?(?:[.!?;](?=\s|$)|(?=\n)|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0]) {
      re.lastIndex++;
      continue;
    }
    const lead = m[0].length - m[0].trimStart().length;
    if (m[0].trim()) out.push({ text: m[0].trim(), start: m.index + lead });
  }
  return out;
}

/** "We're Acme, a 9-person team building X" describes the company, not the candidate. */
const COMPANY_DESC =
  /^(we're|we are|our (team|company|mission|product)|about us|at [A-Z][\w ]+,? we|[A-Z][\w]+ (is|builds) )/i;

function clauses(sentence: { text: string; start: number }): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /[^,]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence.text)))
    if (m[0].trim()) out.push({ text: m[0].trim(), start: sentence.start + m.index });
  return out;
}

function importanceOf(clause: string, sentence: string): { importance: Importance; confidence: number } {
  if (NICE_CUES.test(clause)) return { importance: "NICE", confidence: 0.9 };
  if (MUST_CUES.test(clause)) return { importance: "MUST", confidence: 0.85 };
  if (STRONG_CUES.test(clause)) return { importance: "STRONG", confidence: 0.75 };
  if (NICE_CUES.test(sentence)) return { importance: "NICE", confidence: 0.65 };
  if (MUST_CUES.test(sentence)) return { importance: "MUST", confidence: 0.6 };
  return { importance: "STRONG", confidence: 0.55 };
}

export function parseRoleBrief(raw: string, org: OrgContext): RoleProposal {
  const text = raw
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  const lower = text.toLowerCase();
  const ambiguities: Ambiguity[] = [];
  const injection = detectPromptInjection(text);
  const protectedFlags = detectProtectedTraits(text);
  const protectedSpans = protectedFlags.map((f) => [f.start, f.start + f.excerpt.length] as const);
  const overlapsProtected = (start: number, end: number) =>
    protectedSpans.some(([a, b]) => start < b && end > a);

  // ---- title
  const tm = text.match(TITLE_RE);
  const firstLine = text.split("\n")[0]!.trim();
  const title: Field<string> = tm
    ? { value: titleCase(tm[1]!.replace(/\s+/g, " ")), confidence: 0.85, source: tm[0] }
    : firstLine.split(" ").length <= 8
      ? { value: titleCase(firstLine.replace(/[.:]$/, "")), confidence: 0.55, source: firstLine }
      : { value: "Untitled role", confidence: 0.1, source: null };
  if (title.confidence < 0.5)
    ambiguities.push({ key: "title", question: "What is the job title for this role?", severity: "high" });

  // ---- location / mode
  const metros = findMetros(text);
  const metro = metros[0]?.metro ?? null;
  const onsite = /\b(on-?site|in[- ]office|in[- ]person|in the office|5 days in)\b/i.exec(text);
  const hybrid = /\bhybrid\b/i.exec(text);
  const remote = /\b(fully )?remote\b/i.exec(text);
  const notRemote = /\b(not|no) remote\b/i.test(text);
  let locationMode: Field<LocationMode>;
  if (hybrid) locationMode = { value: "HYBRID", confidence: 0.85, source: hybrid[0] };
  else if (onsite || notRemote)
    locationMode = { value: "ONSITE", confidence: 0.9, source: onsite?.[0] ?? "not remote" };
  else if (remote) locationMode = { value: "REMOTE", confidence: 0.85, source: remote[0] };
  else if (metro) {
    locationMode = { value: "ONSITE", confidence: 0.45, source: `mentions ${metro.city}` };
    ambiguities.push({
      key: "locationMode",
      question: `Is this role onsite in ${metro.city}, hybrid, or remote-friendly?`,
      severity: "high",
    });
  } else {
    locationMode = { value: "REMOTE", confidence: 0.3, source: null };
    ambiguities.push({
      key: "locationMode",
      question: "Where is this role based, and is it onsite, hybrid, or remote?",
      severity: "high",
    });
  }
  if ((onsite || hybrid) && remote && !notRemote && !/remote[- ]friendly/i.test(text)) {
    ambiguities.push({
      key: "locationMode",
      question: "The brief mentions both remote and in-office work — which applies?",
      severity: "high",
    });
  }
  if (metro && remote && locationMode.value === "REMOTE")
    ambiguities.push({
      key: "city",
      question: `Is ${metro.city} a requirement or just where the company is based?`,
      severity: "low",
    });
  if (!metro && locationMode.value !== "REMOTE")
    ambiguities.push({ key: "city", question: "Which city is this role based in?", severity: "high" });

  // ---- compensation
  const range = text.match(/\$?\s?(\d{2,3})(?:,000|k)\s*(?:-|–|—|to)\s*\$?\s?(\d{2,3})(?:,000|k)/i);
  const single = text.match(/\$\s?(\d{2,3})(?:,000|k)\b/i);
  const minComp: Field<number | null> = range
    ? { value: parseInt(range[1]!, 10) * 1000, confidence: 0.9, source: range[0] }
    : single
      ? { value: null, confidence: 0.5, source: single[0] }
      : { value: null, confidence: 0, source: null };
  const maxComp: Field<number | null> = range
    ? { value: parseInt(range[2]!, 10) * 1000, confidence: 0.9, source: range[0] }
    : single
      ? { value: parseInt(single[1]!, 10) * 1000, confidence: 0.6, source: single[0] }
      : { value: null, confidence: 0, source: null };
  if (maxComp.value === null)
    ambiguities.push({
      key: "compensation",
      question: "What base salary range (and equity) can you offer? Candidates rank compensation highly.",
      severity: "medium",
    });

  // ---- visa
  const visaYes =
    /\b(can|will|able to|happy to|do)\s+(support|sponsor|provide|offer)\b[^.]{0,20}\b(visa|sponsorship|h-?1b)|\bsponsorship (is )?available\b|\bwe sponsor\b|\bvisa support\b/i.exec(
      text,
    );
  const visaNo =
    /\b(cannot|can't|can not|unable to|won't|will not|do not|don't)\s+(support|sponsor|provide|offer)|\bno (visa )?sponsorship\b|\bmust be (authorized|eligible) to work\b|\bwithout sponsorship\b/i.exec(
      text,
    );
  const visaSupport: Field<TriState> = visaNo
    ? { value: "NO", confidence: 0.9, source: visaNo[0] }
    : visaYes
      ? { value: "YES", confidence: 0.9, source: visaYes[0] }
      : { value: "UNKNOWN", confidence: 0, source: null };
  if (visaSupport.value === "UNKNOWN")
    ambiguities.push({
      key: "visaSupport",
      question: "Can you sponsor work visas? This decides whether authorization is a hard constraint.",
      severity: "medium",
    });

  // ---- years
  const yr = yearsRequired(text);
  const yrRange = text.match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*(?:years|yrs)/i);
  const minYears: Field<number | null> = yrRange
    ? { value: parseInt(yrRange[1]!, 10), confidence: 0.85, source: yrRange[0] }
    : yr !== null
      ? { value: yr, confidence: 0.85, source: `${yr}+ years` }
      : { value: null, confidence: 0, source: null };
  const maxYears: Field<number | null> = yrRange
    ? { value: parseInt(yrRange[2]!, 10), confidence: 0.8, source: yrRange[0] }
    : { value: null, confidence: 0, source: null };
  if (minYears.value === null && /\b(senior|staff|principal|lead)\b/i.test(text))
    ambiguities.push({
      key: "minYears",
      question: "“Senior” can mean very different things — roughly how many years of experience?",
      severity: "low",
    });

  // ---- stage / team size
  let companyStage: Field<CompanyStage> = {
    value: org.stage,
    confidence: 0.6,
    source: "organization profile",
  };
  const st = /\b(pre-?seed|seed|series[- ]a|series[- ]b)\b/i.exec(text);
  if (st) {
    const v = st[1]!.toLowerCase().replace(" ", "-").replace("preseed", "pre-seed") as CompanyStage;
    companyStage = {
      value: v.startsWith("series") ? (v.replace(/series-?/, "series-") as CompanyStage) : v,
      confidence: 0.9,
      source: st[0],
    };
  } else if (
    /\b(founding|first (engineer|hire)|tiny team)\b/i.test(text) &&
    !["series-b", "growth", "public"].includes(org.stage)
  ) {
    companyStage = { value: org.stage, confidence: 0.7, source: "founding/tiny-team language + org profile" };
  }
  const ts = text.match(
    /\bteam of (\d{1,4})\b|\b(\d{1,4})[- ]person (?:team|company)\b|\b(\d{1,4}) (?:people|employees)\b/i,
  );
  const teamSize: Field<number | null> = ts
    ? { value: parseInt(ts[1] ?? ts[2] ?? ts[3]!, 10), confidence: 0.9, source: ts[0] }
    : /\btiny\b/i.test(text)
      ? { value: 8, confidence: 0.4, source: "“tiny team”" }
      : /\bsmall team\b/i.test(text)
        ? { value: 15, confidence: 0.35, source: "“small team”" }
        : { value: null, confidence: 0, source: null };
  if (teamSize.value !== null && teamSize.confidence < 0.5)
    ambiguities.push({
      key: "teamSize",
      question: `How big is the team today? (assumed ~${teamSize.value})`,
      severity: "low",
    });

  const employmentType: Field<string> = /\bcontract(or)?\b/i.test(text)
    ? { value: "CONTRACT", confidence: 0.8, source: "contract" }
    : /\bpart[- ]time\b/i.test(text)
      ? { value: "PART_TIME", confidence: 0.8, source: "part-time" }
      : { value: "FULL_TIME", confidence: 0.6, source: null };

  let domain: Field<string | null> = { value: null, confidence: 0, source: null };
  for (const [re, d] of DOMAINS) {
    const m = re.exec(text);
    if (m) {
      domain = { value: d, confidence: 0.7, source: m[0] };
      break;
    }
  }

  // ---- requirements
  const reqs = new Map<string, ParsedRequirement>();
  const responsibilities: string[] = [];
  const add = (r: ParsedRequirement) => {
    const prev = reqs.get(r.normalizedKey);
    const rank = { MUST: 3, STRONG: 2, NICE: 1 };
    if (!prev || rank[r.importance] > rank[prev.importance]) reqs.set(r.normalizedKey, r);
  };
  for (const s of sentences(text)) {
    if (
      COMPANY_DESC.test(s.text) &&
      !MUST_CUES.test(s.text) &&
      !NICE_CUES.test(s.text) &&
      !/\bneed|hiring|looking for|seeking\b/i.test(s.text)
    )
      continue;
    for (const cl of clauses(s)) {
      if (overlapsProtected(cl.start, cl.start + cl.text.length)) continue; // never turn protected traits into requirements
      const imp = importanceOf(cl.text, s.text);
      for (const m of extractSkillMentions(cl.text)) {
        const def = SKILL_BY_KEY[m.key]!;
        add({
          category: "SKILL",
          label: def.display,
          normalizedKey: m.key,
          importance: imp.importance,
          weight: IMPORTANCE_WEIGHT[imp.importance],
          sourceText: cl.text,
          confidence: Math.min(0.95, imp.confidence + 0.05),
          isHardConstraint: false,
        });
      }
      for (const w of WORK_STYLE) {
        if (w.re.test(cl.text)) {
          add({
            category: w.category,
            label: w.label,
            normalizedKey: w.key,
            importance: imp.importance === "NICE" ? "NICE" : w.key === "ai_shipped" ? "MUST" : imp.importance,
            weight: IMPORTANCE_WEIGHT[imp.importance],
            sourceText: cl.text,
            confidence: 0.75,
            isHardConstraint: false,
          });
          if (
            /^(?:can |will |to |you'll |you will )?(own|ship|build|lead|design|scale|drive|create|run|talk|work)/i.test(
              cl.text,
            )
          )
            responsibilities.push(
              cl.text.replace(/^(can|will|to|you'll|you will)\s+/i, "").replace(/\.$/, ""),
            );
        }
      }
      const edu = cl.text.match(/\b(bs|ms|phd|bachelor'?s|master'?s|degree)\b[^,.;]{0,40}/i);
      if (edu)
        add({
          category: "EDUCATION",
          label: titleCase(edu[0]),
          normalizedKey: `edu:${edu[1]!.toLowerCase()}`,
          importance: /required|must/i.test(cl.text) ? "MUST" : "NICE",
          weight: 0.3,
          sourceText: cl.text,
          confidence: 0.6,
          isHardConstraint: false,
        });
      if (
        /\b(clearance|certified|certification|license[d]?)\b/i.test(cl.text) &&
        /\b(must|required)\b/i.test(cl.text)
      ) {
        add({
          category: "OTHER",
          label: cl.text.replace(/^(must have|must be|required:?)\s*/i, ""),
          normalizedKey: `cert:${cl.text
            .toLowerCase()
            .replace(/[^a-z]+/g, "_")
            .slice(0, 30)}`,
          importance: "MUST",
          weight: 1,
          sourceText: cl.text,
          confidence: 0.7,
          isHardConstraint: true,
        });
      }
      if (
        /^(own|ship|build|design|lead|scale|drive|create|partner|work with|talk to)\b/i.test(cl.text) &&
        !responsibilities.includes(cl.text)
      )
        responsibilities.push(cl.text.replace(/\.$/, ""));
    }
  }
  if (metro && locationMode.value !== "REMOTE") {
    reqs.set("location", {
      category: "LOCATION",
      label: `${locationMode.value === "HYBRID" ? "Hybrid" : "Onsite"} in ${metro.city}`,
      normalizedKey: "location",
      importance: "MUST",
      weight: 1,
      sourceText: (onsite?.[0] ?? hybrid?.[0] ?? metro.city) as string,
      confidence: locationMode.confidence,
      isHardConstraint: locationMode.confidence >= 0.6,
    });
  }
  if (visaSupport.value === "NO") {
    reqs.set("authorization", {
      category: "AUTHORIZATION",
      label: `Authorized to work in ${metro?.countryCode ?? org.countryCode} (no sponsorship)`,
      normalizedKey: "authorization",
      importance: "MUST",
      weight: 1,
      sourceText: visaSupport.source ?? "",
      confidence: 0.9,
      isHardConstraint: true,
    });
  }
  if (maxComp.value !== null) {
    reqs.set("compensation", {
      category: "COMPENSATION",
      label: `Base up to $${Math.round(maxComp.value / 1000)}k`,
      normalizedKey: "compensation",
      importance: "STRONG",
      weight: 0.6,
      sourceText: maxComp.source ?? "",
      confidence: maxComp.confidence,
      isHardConstraint: false,
    });
  }
  if (![...reqs.values()].some((r) => r.category === "SKILL"))
    ambiguities.push({
      key: "skills",
      question: "Which technical skills are must-haves? None were detected in the brief.",
      severity: "high",
    });

  const protectedTraitWarnings = [
    ...new Set(
      protectedFlags.map(
        (f) =>
          `“${f.excerpt}” refers to ${f.kind} — a protected characteristic. It was not turned into a requirement and can't be used for ranking.`,
      ),
    ),
  ];
  if (injection.length)
    ambiguities.push({
      key: "injection",
      question: "The brief contains instruction-like text that was ignored. Please review it.",
      severity: "medium",
    });

  return {
    parserVersion: PARSER_VERSION,
    title,
    locationMode,
    city: {
      value: metro?.city ?? null,
      confidence: metro ? 0.9 : 0,
      source: metros[0] ? text.slice(metros[0].start, metros[0].end) : null,
    },
    region: { value: metro?.region ?? null, confidence: metro ? 0.9 : 0, source: null },
    countryCode: {
      value: metro?.countryCode ?? org.countryCode,
      confidence: metro ? 0.9 : 0.5,
      source: null,
    },
    minComp,
    maxComp,
    currency: {
      value: maxComp.value !== null ? "USD" : null,
      confidence: maxComp.value !== null ? 0.7 : 0,
      source: null,
    },
    visaSupport,
    minYears,
    maxYears,
    companyStage,
    teamSize,
    employmentType,
    domain,
    responsibilities: [...new Set(responsibilities)].slice(0, 8),
    requirements: [...reqs.values()],
    ambiguities,
    protectedTraitWarnings,
    injectionFlags: injection.map((f) => `${f.kind}: “${f.excerpt}”`),
    descriptionNormalized: lower.includes("ignore")
      ? text.replace(
          /\b(ignore|disregard)\b[^.\n]*(instructions?|prompts?)[^.\n]*[.\n]?/gi,
          "[instruction-like text removed] ",
        )
      : text,
  };
}
