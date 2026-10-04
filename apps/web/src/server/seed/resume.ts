/** Candidate spec → resume text. The text is then ingested through the real parser pipeline. */
import type { Availability, CandidatePreferences, RepoMeta, WorkAuthorization } from "@trajectory/engine";
import { COMPANY_BY_NAME } from "./pools";

export interface ExpSpec {
  title: string;
  company: string;
  start: [number, number]; // [year, month 1-12]
  end: [number, number] | null;
  bullets: string[];
  seniority?: number;
}

export interface ProjectSpec {
  name: string;
  description: string;
  year: number;
  solo: boolean;
  shipped: boolean;
}

export interface CandidateSpec {
  id: string;
  fullName: string;
  headline: string;
  location: string;
  email: string;
  github?: string | null;
  summary: string;
  experiences: ExpSpec[];
  projects: ProjectSpec[];
  repos: RepoMeta[];
  skillsLine: string[];
  education: string;
  workAuthorization: WorkAuthorization | null;
  salaryMin: number | null;
  availability: Availability | null;
  preferences: Partial<CandidatePreferences>;
  importedProfile?: { title: string; company: string; note: string } | null;
  extraLines?: string[];
  latent: {
    archetype: string;
    seniority: number;
    indie: boolean;
    enterprise: boolean;
    labels: Record<string, number>;
  };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmt(d: [number, number] | null): string {
  return d ? `${MON[d[1] - 1]} ${d[0]}` : "Present";
}

function stageLabel(stage: string): string {
  return stage === "pre-seed"
    ? "Pre-seed"
    : stage === "seed"
      ? "Seed"
      : stage === "series-a"
        ? "Series A"
        : stage === "series-b"
          ? "Series B"
          : stage === "growth"
            ? "Growth"
            : "Public";
}

export function renderResume(s: CandidateSpec): string {
  const out: string[] = [];
  out.push(s.fullName);
  out.push(s.headline);
  out.push([s.location, s.email, s.github ? `github.com/${s.github}` : null].filter(Boolean).join(" · "));
  out.push("");
  out.push("SUMMARY");
  out.push(s.summary);
  for (const l of s.extraLines ?? []) out.push(l);
  out.push("");
  out.push("EXPERIENCE");
  for (const e of s.experiences) {
    const co = COMPANY_BY_NAME[e.company];
    const meta = co
      ? ` (${stageLabel(co.stage)} · ${co.size.toLocaleString("en-US")} ${co.size === 1 ? "person" : "people"})`
      : "";
    out.push(`${e.title} — ${e.company}${meta} | ${fmt(e.start)} – ${fmt(e.end)}`);
    for (const b of e.bullets) out.push(`- ${b}`);
  }
  if (s.projects.length) {
    out.push("");
    out.push("PROJECTS");
    for (const p of s.projects)
      out.push(
        `${p.name} — ${p.description}${p.solo && !/solo|independent/i.test(p.description) ? ", built solo" : ""} · ${p.year}`,
      );
  }
  out.push("");
  out.push("SKILLS");
  out.push(s.skillsLine.join(", "));
  out.push("");
  out.push("EDUCATION");
  out.push(s.education);
  return out.join("\n") + "\n";
}
