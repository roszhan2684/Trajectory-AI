"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { act } from "@/server/http";
import { signIn, signOut, sessionData } from "@/server/auth/session";
import { ready } from "@/server/bootstrap";
import { getDB } from "@/server/db/store";
import { acceptInvitation, createOrganization, createUser } from "@/server/services/org";
import { actorFor, audit, track } from "@/server/services/core";

export async function loginAs(userId: string, orgId: string | null) {
  await ready();
  const db = getDB();
  if (!db.users.some((u) => u.id === userId)) return;
  await signIn(userId, orgId);
  const actor = actorFor(userId, orgId);
  audit(actor, "session.signed_in", "user", userId, { method: "demo-persona" });
  track(actor, "signed_in", {});
  redirect("/app");
}

export async function switchOrg(orgId: string) {
  const s = await sessionData();
  if (!s) redirect("/login");
  await ready();
  if (!getDB().members.some((m) => m.userId === s.uid && m.organizationId === orgId)) return;
  await signIn(s.uid, orgId);
  redirect("/app");
}

export async function logout() {
  await signOut();
  redirect("/login");
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(60),
  email: z.string().trim().email("Enter a valid email."),
  orgName: z.string().trim().min(2, "Enter an organization name.").max(80),
  stage: z.enum(["pre-seed", "seed", "series-a", "series-b", "growth", "public"]),
  industry: z.string().trim().max(60).default(""),
});

export async function signup(input: unknown) {
  const res = await act(() => {
    const v = signupSchema.parse(input);
    const user = createUser(v.name, v.email);
    const org = createOrganization(user.id, { name: v.orgName, stage: v.stage, industry: v.industry });
    return { userId: user.id, orgId: org.id };
  });
  if (!res.ok) return res;
  await signIn(res.data.userId, res.data.orgId);
  redirect("/app/roles/new?welcome=1");
}

export async function acceptInvite(token: string, name: string, email: string) {
  const res = await act(() => {
    const user = createUser(name, email);
    const org = acceptInvitation(user.id, token);
    return { userId: user.id, orgId: org.id };
  });
  if (!res.ok) return res;
  await signIn(res.data.userId, res.data.orgId);
  redirect("/app");
}
