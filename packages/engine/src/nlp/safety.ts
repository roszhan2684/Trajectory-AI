/**
 * Guards applied to every piece of user- or candidate-supplied text.
 * - Prompt injection: source documents are DATA. We flag instruction-like content so it is
 *   visible to humans; nothing in the pipeline ever executes or obeys it.
 * - Protected traits: never become requirements, preferences or ranking features (spec §24.3).
 */
export interface SafetyFlag {
  kind: string;
  excerpt: string;
  start: number;
}

const INJECTION: [RegExp, string][] = [
  [
    /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all)\b[^.\n]{0,20}\b(instructions?|prompts?|rules)\b/gi,
    "instruction override",
  ],
  [
    /\b(rank|score|rate|place)\b[^.\n]{0,25}\b(this candidate|me|him|her)\b[^.\n]{0,20}\b(first|#?1|highest|top|100)\b/gi,
    "ranking manipulation",
  ],
  [/\byou are (now )?(an?|the) (ai|assistant|system|recruiter|model)\b/gi, "role hijack"],
  [/<\s*\/?\s*(system|instructions?|prompt)\s*>/gi, "markup injection"],
  [/\bsystem prompt\b|\bjailbreak\b|\bdeveloper mode\b/gi, "prompt probing"],
  [
    /\b(send|email|forward)\b[^.\n]{0,30}\b(api key|password|credentials|secrets?)\b/gi,
    "exfiltration attempt",
  ],
];

export function detectPromptInjection(text: string): SafetyFlag[] {
  const out: SafetyFlag[] = [];
  for (const [re, kind] of INJECTION) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ kind, excerpt: m[0], start: m.index });
  }
  return out.sort((a, b) => a.start - b.start);
}

const TEAM_WORDS =
  /\b(teams?|companies|company|startups?|orgs?|organi[sz]ations?|people|employees|headcount|staff|person)\s*(of|with|under|below|smaller than|less than|<)?\s*$/i;

const PROTECTED: [RegExp, string][] = [
  [
    /\b(young|younger|youthful|older candidates|elderly|millennials?|gen[- ]?z|boomers?|digital natives?)\b/gi,
    "age",
  ],
  [
    /\b(under|over|below|above)\s+\d{2}\b(?!\s*(?:people|employees|engineers|person|%|k\b|years of experience|yrs of experience))/gi,
    "age",
  ],
  [/\b(age|aged)\s*(between|under|below|over|\d)/gi, "age"],
  [/\brecent (college )?grads? only\b/gi, "age"],
  [
    /\b(male|female|men|women|woman|man|guys|girls|gentlemen|ladies|he or she)\b(?!\s*-?\s*(?:power|hours))/gi,
    "sex/gender",
  ],
  [/\b(christian|muslim|jewish|hindu|buddhist|atheist|religio\w*|church)\b/gi, "religion"],
  [
    /\b(married|unmarried|single parents?|no kids|childless|pregnan\w*|maternity|family status)\b/gi,
    "family status",
  ],
  [/\b(disab\w+|able[- ]bodied|handicap\w*|wheelchair)\b/gi, "disability"],
  [
    /\b(race|racial|ethnicity|ethnic|caucasian|hispanic|latino|latina|asian|african[- ]american)\b/gi,
    "race/ethnicity",
  ],
  [/\b(gay|straight|lesbian|lgbt\w*|sexual orientation)\b/gi, "sexual orientation"],
  [/\bnative (english )?speakers?\b/gi, "national origin"],
];

export function detectProtectedTraits(text: string): SafetyFlag[] {
  const out: SafetyFlag[] = [];
  for (const [re, kind] of PROTECTED) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      // "teams under 30" is team size, not age.
      if (
        kind === "age" &&
        /^(under|over|below|above)/i.test(m[0]) &&
        TEAM_WORDS.test(text.slice(Math.max(0, m.index - 40), m.index))
      )
        continue;
      out.push({ kind, excerpt: m[0], start: m.index });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
