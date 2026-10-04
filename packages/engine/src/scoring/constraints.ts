/**
 * Layer A — hard constraints. Deterministic; never delegated to a model.
 * UNKNOWN is a first-class outcome and must not silently become FAIL (spec §16.2).
 */
import type { Candidate, ConstraintCheck, ConstraintStatus, JobRole, RoleRequirement } from "../types";
import { METRO_BY_KEY, metroForCity } from "../geo";

export function candidateMetroKey(c: Candidate): string | null {
  return c.metro ?? metroForCity(c.city)?.key ?? null;
}

export function roleMetroKey(r: JobRole): string | null {
  return metroForCity(r.city)?.key ?? null;
}

export function hasSkillNegativeAnswer(c: Candidate, key: string): boolean {
  return c.evidence.some((n) => n.type === "ANSWER" && n.metadata.negativeSkill === key);
}

export function hasSkillEvidence(c: Candidate, key: string): boolean {
  return c.skills.some((s) => s.skillKey === key);
}

export function evaluateConstraints(role: JobRole, reqs: RoleRequirement[], c: Candidate): ConstraintCheck[] {
  const checks: ConstraintCheck[] = [];

  // ---- location
  if (role.locationMode !== "REMOTE" && role.city) {
    const rm = roleMetroKey(role);
    const cm = candidateMetroKey(c);
    const where = METRO_BY_KEY[rm ?? ""]?.label ?? role.city;
    const modeWord = role.locationMode === "ONSITE" ? "onsite" : "hybrid";
    const acceptsMode =
      c.preferences.workModes === null
        ? null
        : c.preferences.workModes.includes(role.locationMode === "ONSITE" ? "onsite" : "hybrid") ||
          c.preferences.workModes.includes("onsite");
    let status: ConstraintStatus;
    let detail: string;
    if (acceptsMode === false) {
      status = "FAIL";
      detail = `Candidate only accepts ${c.preferences.workModes!.join("/")} work; role is ${modeWord} in ${where}.`;
    } else if (rm && cm === rm) {
      status = "PASS";
      detail = `Based in ${where}.`;
    } else if (c.preferences.openToRelocate === true) {
      status = "PASS";
      detail = `Lives in ${c.city ?? "another city"}; open to relocating to ${where}.`;
    } else if (c.preferences.openToRelocate === false) {
      status = "FAIL";
      detail = `Lives in ${c.city ?? "another city"} and is not open to relocating; role is ${modeWord} in ${where}.`;
    } else {
      status = "UNKNOWN";
      detail = `Lives in ${c.city ?? "an unknown location"}; relocation willingness for ${where} is unknown.`;
    }
    checks.push({
      key: "location",
      label: `${modeWord === "onsite" ? "Onsite" : "Hybrid"} in ${where}`,
      status,
      detail,
      resolutionQuestion:
        status === "UNKNOWN" ? `Would you be willing to work ${modeWord} in ${role.city}?` : null,
      soft: false,
    });
  } else if (role.locationMode === "REMOTE") {
    const sameCountry = c.countryCode === role.countryCode;
    checks.push({
      key: "location",
      label: `Remote (${role.countryCode})`,
      status:
        c.countryCode === null ? "UNKNOWN" : sameCountry || c.preferences.openToRelocate ? "PASS" : "UNKNOWN",
      detail:
        c.countryCode === null
          ? "Candidate country unknown."
          : sameCountry
            ? `Based in ${role.countryCode}.`
            : `Based in ${c.countryCode}; role hires in ${role.countryCode}.`,
      resolutionQuestion: sameCountry ? null : `Can you work remotely from ${role.countryCode}?`,
      soft: false,
    });
  }

  // ---- work authorization
  const needsSponsor =
    c.workAuthorization === "needs_sponsorship" ||
    (c.countryCode !== null && c.countryCode !== role.countryCode && c.workAuthorization === null);
  if (role.visaSupport === "YES") {
    checks.push({
      key: "work_authorization",
      label: "Work authorization",
      status: "PASS",
      detail: needsSponsor
        ? "Needs sponsorship — role supports sponsorship."
        : "Role supports sponsorship if needed.",
      resolutionQuestion: null,
      soft: false,
    });
  } else {
    let status: ConstraintStatus;
    let detail: string;
    if (c.workAuthorization === null) {
      status = "UNKNOWN";
      detail =
        role.visaSupport === "NO"
          ? "Role cannot sponsor; candidate's authorization is unknown."
          : "Sponsorship policy and candidate authorization are both unknown.";
    } else if (needsSponsor) {
      status = role.visaSupport === "NO" ? "FAIL" : "UNKNOWN";
      detail =
        role.visaSupport === "NO"
          ? "Candidate needs sponsorship; role cannot sponsor."
          : "Candidate needs sponsorship; role's sponsorship policy is unknown.";
    } else {
      status = "PASS";
      detail = `Authorized to work (${c.workAuthorization.replace("_", " ")}).`;
    }
    checks.push({
      key: "work_authorization",
      label: "Work authorization",
      status,
      detail,
      resolutionQuestion:
        status === "UNKNOWN" && c.workAuthorization === null
          ? `Are you authorized to work in ${role.countryCode} without visa sponsorship?`
          : null,
      soft: false,
    });
  }

  // ---- compensation (explicit incompatibility only; unknown is a soft uncertainty)
  if (role.maxComp !== null) {
    if (c.salaryMin === null) {
      checks.push({
        key: "compensation",
        label: "Compensation",
        status: "UNKNOWN",
        detail: "Candidate's expectations are unknown.",
        resolutionQuestion: `Is a base salary up to ${fmtMoney(role.maxComp, role.currency)} within your expectations?`,
        soft: true,
      });
    } else {
      const over = c.salaryMin > role.maxComp * 1.15;
      checks.push({
        key: "compensation",
        label: "Compensation",
        status: over ? "FAIL" : "PASS",
        detail: over
          ? `Expects ≥ ${fmtMoney(c.salaryMin, c.currency)}; role tops out at ${fmtMoney(role.maxComp, role.currency)}.`
          : `Expects ${fmtMoney(c.salaryMin, c.currency)}+; role range ${fmtMoney(role.minComp ?? role.maxComp, role.currency)}–${fmtMoney(role.maxComp, role.currency)}.`,
        resolutionQuestion: null,
        soft: false,
      });
    }
  }

  // ---- explicit must-have constraints (e.g. certification) flagged by the recruiter
  for (const r of reqs.filter(
    (q) =>
      q.isHardConstraint && (q.category === "SKILL" || q.category === "EDUCATION" || q.category === "OTHER"),
  )) {
    const neg = hasSkillNegativeAnswer(c, r.normalizedKey);
    const has = hasSkillEvidence(c, r.normalizedKey);
    checks.push({
      key: "must_have",
      label: `Must have: ${r.label}`,
      status: neg ? "FAIL" : has ? "PASS" : "UNKNOWN",
      detail: neg
        ? `Candidate said they do not have ${r.label}.`
        : has
          ? `Evidence of ${r.label} on profile.`
          : `No evidence of ${r.label} yet.`,
      resolutionQuestion: !neg && !has ? `Do you have hands-on experience with ${r.label}?` : null,
      soft: false,
    });
  }
  return checks;
}

export function aggregateConstraintStatus(checks: ConstraintCheck[]): ConstraintStatus {
  const hard = checks.filter((c) => !c.soft || c.status === "FAIL");
  if (hard.some((c) => c.status === "FAIL")) return "FAIL";
  if (hard.some((c) => c.status === "UNKNOWN")) return "UNKNOWN";
  return "PASS";
}

export function fmtMoney(n: number | null, currency: string | null): string {
  if (n === null) return "—";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : "$";
  return `${sym}${Math.round(n / 1000)}k`;
}
