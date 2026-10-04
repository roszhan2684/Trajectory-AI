/** Consistent envelopes, error mapping, rate limiting and API-key auth for route handlers. */
import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError, HTTP_STATUS } from "@trajectory/engine";
import { getDB, persist } from "./db/store";
import { sha256 } from "./auth/tokens";
import { ready } from "./bootstrap";
import { actorFor, type Actor } from "./services/core";
import { actorOrThrow } from "./auth/session";

export type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fields?: Record<string, string> } };

export function toError(e: unknown): Extract<Envelope<never>, { ok: false }>["error"] & { status: number } {
  if (e instanceof DomainError) return { code: e.code, message: e.userMessage, status: HTTP_STATUS[e.code] };
  if (e instanceof ZodError) {
    const fields = Object.fromEntries(e.issues.map((i) => [i.path.join("."), i.message]));
    return { code: "VALIDATION", message: e.issues[0]?.message ?? "Invalid input.", fields, status: 422 };
  }
  if (e instanceof Error && e.name === "PermanentError")
    return { code: "VALIDATION", message: e.message, status: 422 };
  console.error("[trajectory] unexpected error", e instanceof Error ? e.message : e);
  return {
    code: "INTERNAL",
    message: "Something went wrong on our side. The error was logged.",
    status: 500,
  };
}

export async function handle<T>(fn: () => Promise<T> | T): Promise<NextResponse> {
  try {
    await ready();
    return NextResponse.json({ ok: true, data: await fn() } satisfies Envelope<T>);
  } catch (e) {
    const { status, ...error } = toError(e);
    return NextResponse.json({ ok: false, error } satisfies Envelope<never>, { status });
  }
}

/** Server-action wrapper: never throws to the client, never leaks stack traces. */
export async function act<T>(fn: () => Promise<T> | T): Promise<Envelope<T>> {
  try {
    await ready();
    return { ok: true, data: await fn() };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    )
      throw e;
    const { status: _s, ...error } = toError(e);
    return { ok: false, error };
  }
}

// ------------------------------------------------------------------------------ rate limiting
interface Bucket {
  tokens: number;
  at: number;
}
const g = globalThis as unknown as { __trajectoryBuckets?: Map<string, Bucket> };
const buckets = (g.__trajectoryBuckets ??= new Map());

/** In-memory token bucket (swap for Upstash/Redis in multi-instance deployments). */
export function rateLimit(key: string, perMinute: number): void {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: perMinute, at: now };
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
  b.at = now;
  if (b.tokens < 1)
    throw new DomainError("RATE_LIMITED", "You're doing that a lot — please wait a few seconds.");
  b.tokens -= 1;
  buckets.set(key, b);
}

// ------------------------------------------------------------------------------ auth for /api/v1
export async function apiActor(req: Request): Promise<Actor> {
  await ready();
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const secret = auth.slice(7).trim();
    const db = getDB();
    const key = db.apiKeys.find((k) => k.hash === sha256(secret));
    if (!key) throw new DomainError("UNAUTHENTICATED", "Invalid API key.");
    key.lastUsedAt = new Date().toISOString();
    persist();
    return actorFor(key.userId, key.organizationId, "mcp");
  }
  return actorOrThrow();
}
