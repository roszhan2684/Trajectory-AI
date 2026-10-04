/**
 * Cross-cutting service primitives: actor/tenant authorization, audit, analytics, tracing.
 * Every organization-owned read goes through `assertTenant`, which returns NOT_FOUND (not
 * FORBIDDEN) for other tenants' objects so IDs can't be probed.
 */
import {
  DomainError,
  assertCan,
  capabilitiesFor,
  hashString,
  type Capability,
  type MemberRole,
  type Organization,
  type Trace,
  type TraceSpan,
  type User,
} from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";

export interface Actor {
  user: User;
  org: Organization;
  role: MemberRole;
  caps: Capability[];
  via: "web" | "mcp" | "system" | "candidate_portal";
}

export function actorFor(userId: string, orgId: string | null, via: Actor["via"] = "web"): Actor {
  const db = getDB();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new DomainError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  const memberships = db.members.filter((m) => m.userId === userId);
  const m = memberships.find((x) => x.organizationId === orgId) ?? memberships[0];
  if (!m) throw new DomainError("FORBIDDEN", "You are not a member of any organization yet.");
  const org = db.organizations.find((o) => o.id === m.organizationId)!;
  return { user, org, role: m.role, caps: capabilitiesFor(m.role, org), via };
}

export function requireCap(actor: Actor, cap: Capability): void {
  assertCan(actor.role, cap, actor.org);
}

export function assertTenant<T extends { organizationId: string }>(
  actor: Actor,
  entity: T | undefined | null,
  what = "Item",
): T {
  if (!entity || entity.organizationId !== actor.org.id)
    throw new DomainError("NOT_FOUND", `${what} not found.`);
  return entity;
}

const clockState = globalThis as unknown as { __trajectorySeedClock?: Date | null };

/** Wall clock, overridable during seeding so generated history has realistic timestamps. */
export function now(): Date {
  return clockState.__trajectorySeedClock ? new Date(clockState.__trajectorySeedClock) : new Date();
}

export function setSeedClock(d: Date | null): void {
  clockState.__trajectorySeedClock = d;
}

export function orgHash(orgId: string | null): string | null {
  return orgId ? `org_${hashString(`trajectory:${orgId}`)}` : null;
}

// ------------------------------------------------------------------------------ audit
export function audit(
  actor: Actor | null,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
): void {
  const db = getDB();
  db.audit.push({
    id: nextId(db, "aud"),
    organizationId: actor?.org.id ?? null,
    actorUserId: actor?.user.id ?? null,
    action,
    entityType,
    entityId,
    metadata: { ...metadata, via: actor?.via ?? "system" },
    createdAt: now().toISOString(),
  });
  if (db.audit.length > 3000) db.audit.splice(0, db.audit.length - 3000);
  persist();
}

// ------------------------------------------------------------------------------ analytics (PostHog-shaped, local sink)
const ALLOWED_PROP = /^[a-z_]{1,40}$/;

/** Product analytics: only scalar, non-text properties. Free text / resume content is dropped. */
export function track(
  actor: Actor | null,
  name: string,
  props: Record<string, string | number | boolean | null> = {},
): void {
  const db = getDB();
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!ALLOWED_PROP.test(k)) continue;
    if (typeof v === "string" && (v.length > 48 || /\s{2,}|\n/.test(v))) continue; // never ship free text
    clean[k] = v;
  }
  db.analytics.push({
    id: nextId(db, "evt"),
    name,
    orgHash: orgHash(actor?.org.id ?? null),
    properties: { ...clean, role: actor?.role ?? null },
    createdAt: now().toISOString(),
  });
  if (db.analytics.length > 3000) db.analytics.splice(0, db.analytics.length - 3000);
  persist();
}

// ------------------------------------------------------------------------------ tracing (Langfuse-shaped, local store)
export class Tracer {
  private spans: TraceSpan[] = [];
  private t0 = performance.now();
  readonly id: string;
  private stack: string[] = [];

  constructor(
    private name: string,
    private orgId: string | null,
    private metadata: Record<string, string | number | boolean | null>,
  ) {
    const db = getDB();
    this.id = nextId(db, "trc");
    this.spans.push({
      id: `${this.id}_root`,
      parentId: null,
      name,
      kind: "trace",
      startMs: 0,
      endMs: 0,
      metadata: {},
    });
    this.stack.push(`${this.id}_root`);
  }

  span<T>(
    name: string,
    kind: "span" | "generation",
    fn: () => T,
    meta: Record<string, string | number | boolean | null> = {},
  ): T {
    const id = `${this.id}_${this.spans.length}`;
    const s: TraceSpan = {
      id,
      parentId: this.stack[this.stack.length - 1]!,
      name,
      kind,
      startMs: performance.now() - this.t0,
      endMs: 0,
      metadata: meta,
    };
    this.spans.push(s);
    this.stack.push(id);
    try {
      return fn();
    } finally {
      s.endMs = performance.now() - this.t0;
      this.stack.pop();
    }
  }

  record(
    name: string,
    kind: "span" | "generation",
    ms: number,
    meta: Record<string, string | number | boolean | null> = {},
  ): void {
    const start = performance.now() - this.t0 - ms;
    this.spans.push({
      id: `${this.id}_${this.spans.length}`,
      parentId: this.stack[this.stack.length - 1]!,
      name,
      kind,
      startMs: Math.max(0, start),
      endMs: Math.max(0, start) + ms,
      metadata: meta,
    });
  }

  addMeta(meta: Record<string, string | number | boolean | null>): void {
    Object.assign(this.metadata, meta);
  }

  finish(): Trace {
    const db = getDB();
    const total = performance.now() - this.t0;
    this.spans[0]!.endMs = total;
    const trace: Trace = {
      id: this.id,
      name: this.name,
      orgHash: orgHash(this.orgId),
      createdAt: now().toISOString(),
      durationMs: Math.round(total * 100) / 100,
      metadata: {
        environment: process.env.NODE_ENV ?? "development",
        codeVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
        ...this.metadata,
      },
      spans: this.spans.map((s) => ({
        ...s,
        startMs: Math.round(s.startMs * 100) / 100,
        endMs: Math.round(s.endMs * 100) / 100,
      })),
    };
    db.traces.push(trace);
    if (db.traces.length > 400) db.traces.splice(0, db.traces.length - 400);
    persist();
    return trace;
  }
}
