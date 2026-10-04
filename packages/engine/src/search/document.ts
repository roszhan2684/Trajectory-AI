/**
 * Pure candidate -> search document builder (versioned schema `candidates_v1`, spec §15.1).
 * PostgreSQL (here: the demo store) is the source of truth; the index is derived from this.
 */
import type { Candidate, WorkMode } from "../types";
import { SKILL_BY_KEY, hashString } from "../text";
import { candidateText } from "../scoring/context";
import { embed } from "../ml/lsa";

export const SEARCH_SCHEMA_VERSION = "candidates_v1";

export interface SearchDocument {
  id: string;
  full_name: string;
  headline: string;
  current_title: string;
  current_company: string;
  city: string;
  region: string;
  country_code: string;
  metro: string;
  skills: string[];
  skill_names: string;
  industries: string[];
  company_stages: string[];
  company_size_bands: string[];
  years_experience: number;
  visa_needs: "needs_sponsorship" | "authorized" | "unknown";
  work_modes: WorkMode[];
  open_to_relocate: boolean | null;
  profile_text: string;
  trajectory_text: string;
  synthetic: boolean;
  embedding: number[];
}

export function trajectoryText(c: Candidate): string {
  const sorted = [...c.experiences].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const recent = sorted[0];
  const recentSkills = recent
    ? recent.normalizedSkills.map((k) => SKILL_BY_KEY[k]?.display ?? k).slice(0, 6)
    : [];
  const parts: string[] = [];
  if (recent) parts.push(`Currently ${recent.title} at ${recent.company}`);
  if (sorted.length > 1)
    parts.push(
      `previously ${sorted
        .slice(1, 3)
        .map((e) => e.title)
        .join(", ")}`,
    );
  if (recentSkills.length) parts.push(`recently working with ${recentSkills.join(", ")}`);
  const solo = c.projects.filter((p) => p.solo && p.shipped);
  if (solo.length) parts.push(`independently shipped ${solo.map((p) => p.name).join(", ")}`);
  if (c.preferences.desiredStages?.length)
    parts.push(`wants ${c.preferences.desiredStages.join("/")} companies`);
  if (c.preferences.wantsAiWork) parts.push("wants to build AI products");
  return parts.join("; ") + ".";
}

export function buildSearchDocument(c: Candidate): SearchDocument {
  const profile = candidateText(c);
  return {
    id: c.id,
    full_name: c.fullName,
    headline: c.headline,
    current_title: c.currentTitle ?? "",
    current_company: c.currentCompany ?? "",
    city: c.city ?? "",
    region: c.region ?? "",
    country_code: c.countryCode ?? "",
    metro: c.metro ?? "",
    skills: [
      ...new Set(c.skills.filter((s) => !s.inferred || s.confidence >= 0.5).map((s) => s.skillKey)),
    ].sort(),
    skill_names: c.skills.map((s) => s.displayName).join(", "),
    industries: [
      ...new Set(
        c.skills.filter((s) => ["healthcare", "fintech"].includes(s.skillKey)).map((s) => s.skillKey),
      ),
    ],
    company_stages: [
      ...new Set(c.experiences.map((e) => e.companyStage).filter((x): x is NonNullable<typeof x> => !!x)),
    ].sort(),
    company_size_bands: [
      ...new Set(c.experiences.map((e) => e.companySizeBand).filter((x): x is string => !!x)),
    ].sort(),
    years_experience: c.yearsExperience ?? 0,
    visa_needs:
      c.workAuthorization === null
        ? "unknown"
        : c.workAuthorization === "needs_sponsorship"
          ? "needs_sponsorship"
          : "authorized",
    work_modes: c.preferences.workModes ?? [],
    open_to_relocate: c.preferences.openToRelocate,
    profile_text: profile,
    trajectory_text: trajectoryText(c),
    synthetic: c.synthetic,
    embedding: Array.from(embed(profile)).map((v) => Math.round(v * 1e5) / 1e5),
  };
}

/** Content hash over indexed fields only — drives index drift detection/reconciliation. */
export function documentHash(doc: SearchDocument): string {
  const { embedding: _e, ...rest } = doc;
  return hashString(JSON.stringify(rest));
}
