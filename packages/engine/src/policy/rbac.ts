/** Capability-based RBAC (spec §13). UI may hide things; services enforce. */
import type { MemberRole, Organization } from "../types";
import { DomainError } from "../errors";

export type Capability =
  | "org.manage"
  | "members.invite"
  | "roles.edit"
  | "candidates.search"
  | "candidates.ingest"
  | "ranking.refine"
  | "intro.request"
  | "intro.approve"
  | "evals.view"
  | "evals.run"
  | "lab.view"
  | "audit.view";

const MATRIX: Record<MemberRole, Capability[]> = {
  OWNER: [
    "org.manage",
    "members.invite",
    "roles.edit",
    "candidates.search",
    "candidates.ingest",
    "ranking.refine",
    "intro.request",
    "intro.approve",
    "evals.view",
    "evals.run",
    "lab.view",
    "audit.view",
  ],
  ADMIN: [
    "org.manage",
    "members.invite",
    "roles.edit",
    "candidates.search",
    "candidates.ingest",
    "ranking.refine",
    "intro.request",
    "intro.approve",
    "evals.view",
    "evals.run",
    "lab.view",
    "audit.view",
  ],
  RECRUITER: [
    "roles.edit",
    "candidates.search",
    "candidates.ingest",
    "ranking.refine",
    "intro.request",
    "intro.approve",
    "evals.view",
  ],
  HIRING_MANAGER: ["roles.edit", "candidates.search", "ranking.refine", "intro.request", "evals.view"],
  VIEWER: ["candidates.search"],
  INTERNAL_OPERATOR: ["candidates.search", "evals.view", "evals.run", "lab.view", "audit.view"],
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring manager",
  VIEWER: "Viewer",
  INTERNAL_OPERATOR: "Internal operator",
};

export function can(
  role: MemberRole,
  cap: Capability,
  org?: Pick<Organization, "hiringManagersCanApproveIntros">,
): boolean {
  if (cap === "intro.approve" && role === "HIRING_MANAGER") return !!org?.hiringManagersCanApproveIntros;
  return MATRIX[role].includes(cap);
}

export function capabilitiesFor(
  role: MemberRole,
  org?: Pick<Organization, "hiringManagersCanApproveIntros">,
): Capability[] {
  const all = new Set<Capability>(Object.values(MATRIX).flat());
  return [...all].filter((c) => can(role, c, org));
}

export function assertCan(
  role: MemberRole,
  cap: Capability,
  org?: Pick<Organization, "hiringManagersCanApproveIntros">,
): void {
  if (!can(role, cap, org))
    throw new DomainError("FORBIDDEN", `Your role (${ROLE_LABELS[role]}) can't perform this action.`, {
      capability: cap,
    });
}

export const CAPABILITY_MATRIX = MATRIX;
