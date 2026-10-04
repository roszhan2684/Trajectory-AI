import Link from "next/link";
import { ROLE_LABELS } from "@trajectory/engine";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { ready } from "@/server/bootstrap";
import { listPersonas } from "@/server/services/org";
import { Logo } from "@/components/shell/logo";
import { loginAs } from "@/app/actions/session";
import { initials } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const BLURB: Record<string, string> = {
  "Maya Okafor":
    "Full access: roles, ranking, intros, evals, lab and settings. Also an admin at Helix Health.",
  "Jordan Reyes":
    "The day-to-day recruiter: create roles, refine ranking, qualify candidates, approve intros.",
  "Priya Natarajan": "Hiring manager: reviews matches and can approve intros (Northstar allows HM approval).",
  "Sam Whitfield": "Read-only viewer — see RBAC in action (no refinement, no intros).",
  "Daniel Kim": "A different tenant. Proves Northstar data is invisible from Helix Health.",
  "Elena Rossi": "Talent partner at Lumen Robotics (robotics roles).",
  "Trajectory Ops": "Internal operator: lab, traces, jobs and evals across tenants — no hiring actions.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ expired?: string }> }) {
  await ready();
  const personas = listPersonas();
  const { expired } = await searchParams;
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto flex max-w-5xl flex-col px-6 py-10">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <Link href="/signup" className="text-[13px] text-muted hover:text-ink">
            Create your own workspace →
          </Link>
        </div>
        <div className="mt-14 max-w-2xl">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Choose a demo persona</h1>
          <p className="mt-2 text-[15px] text-muted">
            This is a live demo backed by a deterministic synthetic dataset — 3 organizations, 20 roles, 150
            candidates. Each persona has different permissions, so you can see role-based access control and
            tenant isolation working.
          </p>
          {expired && (
            <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[13px] text-warn">
              Your session expired — pick a persona to continue.
            </p>
          )}
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {personas.map(({ user, memberships }) => (
            <form key={user.id} action={loginAs.bind(null, user.id, memberships[0]?.org.id ?? null)}>
              <button className="group flex w-full items-start gap-3 rounded-xl border border-line bg-panel p-4 text-left shadow-panel transition hover:border-line-strong hover:shadow-float">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                  style={{ background: user.avatarColor }}
                >
                  {initials(user.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{user.displayName}</span>
                    <span className="text-xs text-muted">{user.title}</span>
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {memberships.map((m) => (
                      <span
                        key={m.org.id}
                        className="rounded-md bg-subtle px-1.5 py-0.5 text-[11px] text-ink-2"
                      >
                        {m.org.name} · {ROLE_LABELS[m.role]}
                      </span>
                    ))}
                  </span>
                  <span className="mt-2 block text-[13px] leading-snug text-muted">
                    {BLURB[user.displayName] ?? "Member"}
                  </span>
                </span>
                <ArrowRight className="mt-1 size-4 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </button>
            </form>
          ))}
        </div>
        <p className="mt-8 flex items-center gap-2 text-xs text-muted">
          <ShieldCheck className="size-3.5" /> Demo sign-in issues a signed, HTTP-only session cookie.
          Production would use Supabase Auth; authorization checks are identical.
        </p>
      </div>
    </div>
  );
}
