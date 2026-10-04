/** Organizations, team & invitations, API keys, dashboard aggregates. */
import { DomainError, slugify, type MemberRole, type Organization } from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import { randomToken, sha256 } from "../auth/tokens";
import { assertTenant, audit, now, requireCap, track, type Actor } from "./core";

export function listPersonas() {
  const db = getDB();
  return db.users.map((u) => ({
    user: u,
    memberships: db.members
      .filter((m) => m.userId === u.id)
      .map((m) => ({ role: m.role, org: db.organizations.find((o) => o.id === m.organizationId)! })),
  }));
}

export function membershipsFor(userId: string) {
  const db = getDB();
  return db.members
    .filter((m) => m.userId === userId)
    .map((m) => ({ role: m.role, org: db.organizations.find((o) => o.id === m.organizationId)! }));
}

export function createOrganization(
  userId: string,
  input: { name: string; stage: Organization["stage"]; industry: string },
): Organization {
  const db = getDB();
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new DomainError("VALIDATION", "Organization name is too short.");
  let slug = slugify(name) || "org";
  while (db.organizations.some((o) => o.slug === slug)) slug += "-1";
  const org: Organization = {
    id: nextId(db, "org"),
    name,
    slug,
    website: "",
    sizeBand: "1-10",
    stage: input.stage,
    industry: input.industry.slice(0, 60),
    defaultTimezone: "UTC",
    description: "",
    hiringManagersCanApproveIntros: false,
    createdAt: now().toISOString(),
  };
  db.organizations.push(org);
  db.members.push({
    id: nextId(db, "mem"),
    organizationId: org.id,
    userId,
    role: "OWNER",
    invitedByUserId: null,
    joinedAt: now().toISOString(),
  });
  audit(
    { user: db.users.find((u) => u.id === userId)!, org, role: "OWNER", caps: [], via: "web" },
    "org.created",
    "organization",
    org.id,
    {},
  );
  persist();
  return org;
}

export function createUser(displayName: string, email: string) {
  const db = getDB();
  const e = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new DomainError("VALIDATION", "Enter a valid email.");
  const existing = db.users.find((u) => u.email === e);
  if (existing) return existing;
  const u = {
    id: nextId(db, "usr"),
    email: e,
    displayName: displayName.trim().slice(0, 60) || e.split("@")[0]!,
    title: "Member",
    avatarColor: "#475569",
    createdAt: now().toISOString(),
  };
  db.users.push(u);
  persist();
  return u;
}

export function updateOrganization(
  actor: Actor,
  patch: Partial<
    Pick<
      Organization,
      | "name"
      | "website"
      | "industry"
      | "stage"
      | "sizeBand"
      | "hiringManagersCanApproveIntros"
      | "description"
    >
  >,
) {
  requireCap(actor, "org.manage");
  const db = getDB();
  const org = db.organizations.find((o) => o.id === actor.org.id)!;
  Object.assign(org, patch);
  audit(actor, "org.updated", "organization", org.id, { fields: Object.keys(patch) });
  persist();
  return org;
}

export function listTeam(actor: Actor) {
  const db = getDB();
  return {
    members: db.members
      .filter((m) => m.organizationId === actor.org.id)
      .map((m) => ({ member: m, user: db.users.find((u) => u.id === m.userId)! })),
    invitations: db.invitations.filter((i) => i.organizationId === actor.org.id && !i.acceptedByUserId),
  };
}

export function createInvitation(actor: Actor, role: MemberRole, email: string | null) {
  requireCap(actor, "members.invite");
  if (role === "OWNER" || role === "INTERNAL_OPERATOR")
    throw new DomainError("VALIDATION", "That role can't be granted by invitation.");
  const db = getDB();
  const inv = {
    id: nextId(db, "inv"),
    organizationId: actor.org.id,
    role,
    token: randomToken(),
    email,
    createdByUserId: actor.user.id,
    createdAt: now().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    acceptedByUserId: null,
  };
  db.invitations.push(inv);
  audit(actor, "member.invited", "invitation", inv.id, { role });
  track(actor, "member_invited", { role });
  persist();
  return inv;
}

export function acceptInvitation(userId: string, token: string) {
  const db = getDB();
  const inv = db.invitations.find((i) => i.token === token);
  if (!inv || inv.acceptedByUserId || new Date(inv.expiresAt) < now())
    throw new DomainError("NOT_FOUND", "This invitation is invalid or has expired.");
  if (!db.members.some((m) => m.userId === userId && m.organizationId === inv.organizationId)) {
    db.members.push({
      id: nextId(db, "mem"),
      organizationId: inv.organizationId,
      userId,
      role: inv.role,
      invitedByUserId: inv.createdByUserId,
      joinedAt: now().toISOString(),
    });
  }
  inv.acceptedByUserId = userId;
  persist();
  return db.organizations.find((o) => o.id === inv.organizationId)!;
}

export function changeMemberRole(actor: Actor, memberId: string, role: MemberRole) {
  requireCap(actor, "members.invite");
  const db = getDB();
  const m = assertTenant(
    actor,
    db.members.find((x) => x.id === memberId),
    "Member",
  );
  if (m.role === "OWNER") throw new DomainError("FORBIDDEN", "The owner's role can't be changed here.");
  if (role === "OWNER" || role === "INTERNAL_OPERATOR")
    throw new DomainError("VALIDATION", "That role can't be assigned here.");
  const from = m.role;
  m.role = role;
  audit(actor, "member.role_changed", "member", m.id, { from, to: role });
  persist();
  return m;
}

export function createApiKey(actor: Actor, name: string) {
  const db = getDB();
  const secret = `trj_${randomToken(24)}`;
  const key = {
    id: nextId(db, "key"),
    userId: actor.user.id,
    organizationId: actor.org.id,
    name: name.slice(0, 60) || "MCP key",
    prefix: secret.slice(0, 10),
    hash: sha256(secret),
    createdAt: now().toISOString(),
    lastUsedAt: null,
  };
  db.apiKeys.push(key);
  audit(actor, "api_key.created", "api_key", key.id, { prefix: key.prefix });
  persist();
  return { key, secret };
}

export function revokeApiKey(actor: Actor, keyId: string) {
  const db = getDB();
  const key = assertTenant(
    actor,
    db.apiKeys.find((k) => k.id === keyId),
    "API key",
  );
  if (key.userId !== actor.user.id && !actor.caps.includes("org.manage"))
    throw new DomainError("FORBIDDEN", "You can only revoke your own keys.");
  db.apiKeys = db.apiKeys.filter((k) => k.id !== keyId);
  audit(actor, "api_key.revoked", "api_key", keyId, {});
  persist();
}

export function dashboard(actor: Actor) {
  const db = getDB();
  const roles = db.roles.filter((r) => r.organizationId === actor.org.id);
  const roleIds = new Set(roles.map((r) => r.id));
  const matches = db.matches.filter((m) => roleIds.has(m.roleId));
  const weekAgo = Date.now() - 7 * 864e5;
  const audits = db.audit.filter((a) => a.organizationId === actor.org.id);
  const reviewed = new Set(
    audits
      .filter((a) => a.action === "match.status_changed" && +new Date(a.createdAt) > weekAgo)
      .map((a) => a.entityId),
  );
  const convs = db.conversations.filter((c) => c.organizationId === actor.org.id);
  const asked = convs.filter((c) => c.messages.some((m) => m.structured?.kind === "question"));
  const answered = asked.filter((c) => c.messages.some((m) => m.senderType === "CANDIDATE"));
  const intros = db.introductions.filter((i) => i.organizationId === actor.org.id);
  const userName = (id: string | null) => db.users.find((u) => u.id === id)?.displayName ?? "System";
  return {
    activeRoles: roles.filter((r) => r.status === "ACTIVE").length,
    draftRoles: roles.filter((r) => r.status === "DRAFT").length,
    candidatesInPool: db.candidates.length,
    reviewedThisWeek:
      reviewed.size + matches.filter((m) => m.status !== "NEW" && +new Date(m.updatedAt) > weekAgo).length,
    shortlisted: matches.filter((m) => m.status === "SHORTLISTED").length,
    introRequests: intros.filter((i) => !["CANCELLED", "DECLINED", "SENT"].includes(i.status)).length,
    introsAwaitingApproval: intros.filter((i) => i.status === "READY_FOR_APPROVAL").length,
    responseRate: asked.length ? answered.length / asked.length : null,
    openQuestions: asked.length - answered.length,
    activity: audits
      .slice(-14)
      .reverse()
      .map((a) => ({ ...a, actor: userName(a.actorUserId) })),
    roles: roles.filter((r) => r.status === "ACTIVE"),
  };
}
