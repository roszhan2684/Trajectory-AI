/** Natural-language search box → structured query object (no raw engine params leak into the app). */
import { extractSkillMentions, SKILL_BY_KEY } from "../text";
import { findMetros } from "../geo";
import type { SearchFilters } from "./index";

export interface ParsedQuery {
  text: string;
  filters: SearchFilters;
  chips: { kind: "skill" | "metro" | "stage" | "years" | "mode" | "visa"; value: string; label: string }[];
}

const STAGE_PATTERNS: [RegExp, string[], string][] = [
  [/\bpre[- ]?seed\b/i, ["pre-seed"], "Pre-seed"],
  [/\bseed(?:[- ]stage)?\b/i, ["seed"], "Seed"],
  [/\bseries[- ]a\b/i, ["series-a"], "Series A"],
  [/\bseries[- ]b\b/i, ["series-b"], "Series B"],
  [/\bearly[- ]stage\b|\bstartups?\b/i, ["pre-seed", "seed", "series-a"], "Early-stage"],
  [/\b(?:big tech|enterprise|public compan(?:y|ies))\b/i, ["public", "growth"], "Large company"],
];

const FILLER =
  /\b(engineers?|developers?|people|candidates?|folks|someone|who|with|and|in|at|from|the|a|an|for|open to|experience|experienced|years?|yrs|of|based|located|plus|that|has|have|in the)\b/gi;

export function parseNaturalQuery(input: string): ParsedQuery {
  let rest = input;
  const filters: SearchFilters = {};
  const chips: ParsedQuery["chips"] = [];
  const skills = [...new Set(extractSkillMentions(input).map((m) => m.key))];
  if (skills.length) {
    filters.skills = skills;
    for (const s of skills) chips.push({ kind: "skill", value: s, label: SKILL_BY_KEY[s]!.display });
  }
  const metros = findMetros(input);
  if (metros.length) {
    filters.metros = [...new Set(metros.map((m) => m.metro.key))];
    for (const m of metros) {
      chips.push({ kind: "metro", value: m.metro.key, label: m.metro.label });
      rest = rest.replace(input.slice(m.start, m.end), " ");
    }
  }
  for (const [re, stages, label] of STAGE_PATTERNS) {
    if (re.test(rest)) {
      filters.stages = [...new Set([...(filters.stages ?? []), ...stages])];
      chips.push({ kind: "stage", value: stages.join(","), label });
      rest = rest.replace(re, " ");
    }
  }
  const yrs = rest.match(/(\d{1,2})\s*\+?\s*(?:years|yrs)/i);
  if (yrs) {
    filters.minYears = parseInt(yrs[1]!, 10);
    chips.push({ kind: "years", value: yrs[1]!, label: `${yrs[1]}+ yrs` });
    rest = rest.replace(yrs[0], " ");
  }
  if (/\bremote\b/i.test(rest)) {
    filters.workModes = ["remote"];
    chips.push({ kind: "mode", value: "remote", label: "Open to remote" });
    rest = rest.replace(/\bremote\b/i, " ");
  }
  if (/\b(no|without) sponsorship\b|\bauthori[sz]ed\b/i.test(rest)) {
    filters.excludeNeedsSponsorship = true;
    chips.push({ kind: "visa", value: "authorized", label: "No sponsorship needed" });
    rest = rest.replace(/\b(no|without) sponsorship\b|\bauthori[sz]ed\b/i, " ");
  }
  const text = [
    rest
      .replace(FILLER, " ")
      .replace(/[^\w+#.\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ]
    .join(" ")
    .trim();
  return { text, filters, chips };
}
