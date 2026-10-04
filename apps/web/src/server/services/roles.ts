/** RoleService — intake, parsing, editing, activation. */
import {
  DomainError,
  IMPORTANCE_WEIGHT,
  PARSER_VERSION,
  parseRoleBrief,
  type JobRole,
  type RoleProposal,
  type RoleStatus,
} from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import { roleDraftInput, type RoleDraftInput } from "../validation";
import { assertTenant, audit, now, requireCap, track, type Actor } from "./core";
import { generateMatches } from "./matches";

export function parseBrief(actor: Actor, text: string): RoleProposal {
  requireCap(actor, "roles.edit");
  const t0 = performance.now();
  const p = parseRoleBrief(text, { stage: actor.org.stage, countryCode: "US" });
  track(actor, "role_parsed", {
    requirements: p.requirements.length,
    ambiguities: p.ambiguities.length,
    ms: Math.round(performance.now() - t0),
  });
  return p;
}

export function proposalToDraft(p: RoleProposal, raw: string): RoleDraftInput {
  return {
    title: p.title.value,
    descriptionRaw: raw,
    locationMode: p.locationMode.value,
    city: p.city.value,
    region: p.region.value,
    countryCode: p.countryCode.value,
    minComp: p.minComp.value,
    maxComp: p.maxComp.value,
    currency: p.currency.value,
    visaSupport: p.visaSupport.value,
    employmentType: p.employmentType.value,
    minYears: p.minYears.value,
    maxYears: p.maxYears.value,
    companyStage: p.companyStage.value,
    teamSize: p.teamSize.value,
    domain: p.domain.value,
    responsibilities: p.responsibilities,
    requirements: p.requirements.map((r) => ({
      category: r.category,
      label: r.label,
      normalizedKey: r.normalizedKey,
      importance: r.importance,
      isHardConstraint: r.isHardConstraint,
      sourceText: r.sourceText,
      confidence: r.confidence,
    })),
    parse: {
      parserVersion: p.parserVersion,
      fieldConfidence: {
        title: p.title.confidence,
        location: p.locationMode.confidence,
        compensation: p.maxComp.confidence,
        visa: p.visaSupport.confidence,
        years: p.minYears.confidence,
        stage: p.companyStage.confidence,
        teamSize: p.teamSize.confidence,
      },
      fieldSources: Object.fromEntries(
        Object.entries({
          title: p.title.source,
          location: p.locationMode.source,
          compensation: p.maxComp.source,
          visa: p.visaSupport.source,
          years: p.minYears.source,
          stage: p.companyStage.source,
          teamSize: p.teamSize.source,
        }).filter(([, v]) => v) as [string, string][],
      ),
      ambiguities: p.ambiguities,
      protectedTraitWarnings: p.protectedTraitWarnings,
      injectionFlags: p.injectionFlags,
    },
  };
}

function writeRequirements(roleId: string, input: RoleDraftInput) {
  const db = getDB();
  db.requirements = db.requirements.filter((r) => r.roleId !== roleId);
  const seen = new Set<string>();
  for (const r of input.requirements) {
    if (seen.has(r.normalizedKey)) continue;
    seen.add(r.normalizedKey);
    db.requirements.push({ id: nextId(db, "req"), roleId, ...r, weight: IMPORTANCE_WEIGHT[r.importance] });
  }
}

export function createRole(actor: Actor, raw: unknown): JobRole {
  requireCap(actor, "roles.edit");
  const input = roleDraftInput.parse(raw);
  const db = getDB();
  const ts = now().toISOString();
  const role: JobRole = {
    id: nextId(db, "role"),
    organizationId: actor.org.id,
    title: input.title,
    status: "DRAFT",
    descriptionRaw: input.descriptionRaw,
    descriptionNormalized: input.descriptionRaw.replace(/\s+/g, " ").trim(),
    responsibilities: input.responsibilities,
    locationMode: input.locationMode,
    city: input.city,
    region: input.region,
    countryCode: input.countryCode,
    minComp: input.minComp,
    maxComp: input.maxComp,
    currency: input.currency,
    visaSupport: input.visaSupport,
    employmentType: input.employmentType,
    minYears: input.minYears,
    maxYears: input.maxYears,
    companyStage: input.companyStage,
    teamSize: input.teamSize,
    domain: input.domain,
    scoringOverrides: null,
    parse: input.parse ?? {
      parserVersion: PARSER_VERSION,
      fieldConfidence: {},
      fieldSources: {},
      ambiguities: [],
      protectedTraitWarnings: [],
      injectionFlags: [],
    },
    createdByUserId: actor.user.id,
    activatedAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  db.roles.push(role);
  writeRequirements(role.id, input);
  audit(actor, "role.created", "role", role.id, {
    title: role.title,
    requirements: input.requirements.length,
  });
  track(actor, "role_created", {
    requirements: input.requirements.length,
    mode: input.parse ? "brief" : "advanced",
  });
  persist();
  return role;
}

export function updateRole(actor: Actor, roleId: string, raw: unknown): JobRole {
  requireCap(actor, "roles.edit");
  const input = roleDraftInput.parse(raw);
  const db = getDB();
  const role = assertTenant(
    actor,
    db.roles.find((r) => r.id === roleId),
    "Role",
  );
  Object.assign(role, {
    ...input,
    descriptionNormalized: input.descriptionRaw.replace(/\s+/g, " ").trim(),
    parse: input.parse ?? role.parse,
    updatedAt: now().toISOString(),
  });
  writeRequirements(role.id, input);
  audit(actor, "role.updated", "role", role.id, {});
  persist();
  return role;
}

/** Human approval gate: a role becomes ACTIVE only through this explicit action. */
export async function activateRole(actor: Actor, roleId: string) {
  requireCap(actor, "roles.edit");
  const db = getDB();
  const role = assertTenant(
    actor,
    db.roles.find((r) => r.id === roleId),
    "Role",
  );
  if (!db.requirements.some((r) => r.roleId === roleId && r.category === "SKILL"))
    throw new DomainError("VALIDATION", "Add at least one skill requirement before activating.");
  role.status = "ACTIVE";
  role.activatedAt = now().toISOString();
  role.updatedAt = role.activatedAt;
  audit(actor, "role.activated", "role", role.id, {});
  track(actor, "role_activated", {});
  persist();
  return generateMatches(actor, role.id, "manual");
}

export function setRoleStatus(actor: Actor, roleId: string, status: RoleStatus) {
  requireCap(actor, "roles.edit");
  const db = getDB();
  const role = assertTenant(
    actor,
    db.roles.find((r) => r.id === roleId),
    "Role",
  );
  if (status === "ACTIVE") throw new DomainError("INVALID_STATE", "Use activation to make a role active.");
  const from = role.status;
  role.status = status;
  role.updatedAt = now().toISOString();
  audit(actor, "role.status_changed", "role", role.id, { from, to: status });
  persist();
  return role;
}

export function listRoles(actor: Actor) {
  const db = getDB();
  return db.roles
    .filter((r) => r.organizationId === actor.org.id)
    .map((role) => {
      const ms = db.matches.filter((m) => m.roleId === role.id);
      const ranked = ms.filter((m) => m.rank > 0);
      return {
        role,
        requirements: db.requirements.filter((r) => r.roleId === role.id).length,
        matches: ranked.length,
        topScore: ranked.length ? Math.max(...ranked.map((m) => m.finalScore)) : null,
        shortlisted: ms.filter((m) => m.status === "SHORTLISTED").length,
        intros: db.introductions.filter((i) => i.roleId === role.id && i.status !== "CANCELLED").length,
        qualifying: db.conversations.filter((c) => c.roleId === role.id && c.status === "AWAITING_CANDIDATE")
          .length,
        lastRun: db.matchRuns.filter((r) => r.roleId === role.id).pop() ?? null,
        creator: db.users.find((u) => u.id === role.createdByUserId) ?? null,
      };
    })
    .sort(
      (a, b) =>
        ({ ACTIVE: 0, DRAFT: 1, PAUSED: 2, CLOSED: 3 })[a.role.status] -
          { ACTIVE: 0, DRAFT: 1, PAUSED: 2, CLOSED: 3 }[b.role.status] ||
        b.role.createdAt.localeCompare(a.role.createdAt),
    );
}

export function getRole(actor: Actor, roleId: string) {
  const db = getDB();
  const role = assertTenant(
    actor,
    db.roles.find((r) => r.id === roleId),
    "Role",
  );
  return {
    role,
    requirements: db.requirements.filter((r) => r.roleId === role.id),
    preferences: db.rolePreferences.filter((p) => p.roleId === role.id),
    refinements: db.refinements
      .filter((r) => r.roleId === role.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    runs: db.matchRuns
      .filter((r) => r.roleId === role.id)
      .slice(-8)
      .reverse(),
  };
}
