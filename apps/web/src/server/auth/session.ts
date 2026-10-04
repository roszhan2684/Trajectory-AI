/** Cookie session (demo identity provider). Supabase Auth would replace `signIn` + cookie issuance. */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DomainError } from "@trajectory/engine";
import { sign, verify } from "./tokens";
import { ready } from "../bootstrap";
import { actorFor, type Actor } from "../services/core";

export const SESSION_COOKIE = "trj_session";
const TTL = 60 * 60 * 24 * 14;

export async function signIn(userId: string, orgId: string | null) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign({ uid: userId, org: orgId }, TTL), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL,
  });
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionData(): Promise<{ uid: string; org: string | null } | null> {
  const jar = await cookies();
  return verify<{ uid: string; org: string | null }>(jar.get(SESSION_COOKIE)?.value);
}

/** For pages: returns the actor or redirects to /login. */
export async function requireActor(): Promise<Actor> {
  await ready();
  const s = await sessionData();
  if (!s) redirect("/login");
  try {
    return actorFor(s.uid, s.org, "web");
  } catch {
    redirect("/login?expired=1");
  }
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function actorOrThrow(): Promise<Actor> {
  await ready();
  const s = await sessionData();
  if (!s) throw new DomainError("UNAUTHENTICATED", "Please sign in again.");
  return actorFor(s.uid, s.org, "web");
}
