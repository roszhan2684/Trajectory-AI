import Link from "next/link";
import {
  ArrowUpRight,
  Briefcase,
  CircleHelp,
  MessagesSquare,
  Plus,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { dashboard } from "@/server/services/org";
import { listRoles } from "@/server/services/roles";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/domain/score";
import { pct, timeAgo } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

const ACTION_LABEL: Record<string, string> = {
  "role.created": "created role",
  "role.activated": "activated role",
  "role.matches_generated": "generated matches for",
  "match.status_changed": "updated a match",
  "ranking.refinement_proposed": "proposed a ranking refinement",
  "ranking.refinement_applied": "applied a ranking refinement",
  "ranking.refinement_reverted": "reverted a ranking refinement",
  "qualification.questions_sent": "sent qualification questions",
  "qualification.answered": "candidate answered a question",
  "intro.requested": "requested an intro",
  "intro.consent_requested": "asked a candidate for consent",
  "intro.candidate_consented": "candidate consented to an intro",
  "intro.candidate_declined": "candidate declined an intro",
  "intro.approved": "approved an intro",
  "intro.sent": "marked an intro sent",
  "intro.cancelled": "cancelled an intro",
  "candidate.ingested": "ingested a candidate",
  "session.signed_in": "signed in",
  "eval.run_completed": "ran the eval suite",
};

export default async function Dashboard() {
  const actor = await requireActor();
  const d = dashboard(actor);
  const roles = listRoles(actor).filter((r) => r.role.status === "ACTIVE");
  const stats = [
    { label: "Active roles", value: String(d.activeRoles), sub: `${d.draftRoles} in draft`, icon: Briefcase },
    {
      label: "Candidates reviewed (7d)",
      value: String(d.reviewedThisWeek),
      sub: `${d.shortlisted} shortlisted`,
      icon: Users,
    },
    {
      label: "Intro requests",
      value: String(d.introRequests),
      sub: `${d.introsAwaitingApproval} awaiting your approval`,
      icon: Workflow,
    },
    {
      label: "Candidate response rate",
      value: pct(d.responseRate),
      sub: `${d.openQuestions} open question${d.openQuestions === 1 ? "" : "s"}`,
      icon: MessagesSquare,
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="outline">Synthetic demo data — not real traction</Badge>}
        title={`Good to see you, ${actor.user.displayName.split(" ")[0]}`}
        description={`${actor.org.name} · ${d.candidatesInPool} candidates in the evidence graph`}
        actions={
          <Button variant="primary" asChild>
            <Link href="/app/roles/new">
              <Plus /> Create role
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Panel key={s.label} className="p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              {s.label}
              <s.icon className="size-4 text-faint" />
            </div>
            <div className="tabular mt-2 text-2xl font-semibold tracking-tight text-ink">{s.value}</div>
            <div className="mt-0.5 text-xs text-muted">{s.sub}</div>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel>
          <PanelHeader
            title="Active roles"
            description="Best match, pipeline and open questions per role"
            actions={
              <Link href="/app/roles" className="text-xs text-muted hover:text-ink">
                All roles →
              </Link>
            }
          />
          {roles.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              No active roles yet.{" "}
              <Link href="/app/roles/new" className="text-accent hover:underline">
                Describe your first role
              </Link>{" "}
              — it takes about a minute.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {roles.map((r) => (
                <li key={r.role.id}>
                  <Link
                    href={`/app/roles/${r.role.id}/matches`}
                    className="flex items-center gap-4 px-4 py-3 transition hover:bg-panel-2"
                  >
                    {r.topScore !== null ? (
                      <ScoreRing value={r.topScore} size={40} label="Top match" />
                    ) : (
                      <span className="size-10 rounded-full bg-subtle" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-ink">{r.role.title}</div>
                      <div className="mt-0.5 text-xs text-muted">
                        {r.role.locationMode.toLowerCase()} · {r.role.city ?? "Remote"} · {r.matches} ranked ·
                        updated {timeAgo(r.lastRun?.completedAt)}
                      </div>
                    </div>
                    <div className="hidden items-center gap-1.5 sm:flex">
                      {r.shortlisted > 0 && <Badge tone="accent">{r.shortlisted} shortlisted</Badge>}
                      {r.qualifying > 0 && (
                        <Badge tone="info">
                          <CircleHelp className="size-3" />
                          {r.qualifying} qualifying
                        </Badge>
                      )}
                      {r.intros > 0 && (
                        <Badge tone="warn">
                          {r.intros} intro{r.intros > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    <ArrowUpRight className="size-4 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel className="overflow-hidden">
            <div className="relative p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Sparkles className="size-4 text-accent" /> Try the flagship flow
              </div>
              <ol className="mt-3 space-y-2 text-[13px] text-ink-2">
                <li>
                  1. Open <b>Founding Full-Stack AI Engineer</b> → matches
                </li>
                <li>2. Click the top candidate → “Why not 100?”</li>
                <li>
                  3. Refine: “too enterprise, prioritize people who shipped independently in teams under 30”
                </li>
                <li>4. Ask the new #1 a qualification question; answer it in the candidate portal</li>
              </ol>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Recent activity" description="Audit log for this workspace" />
            <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
              {d.activity.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-[13px]">
                  <span className="font-medium text-ink">{a.actor}</span>{" "}
                  <span className="text-muted">{ACTION_LABEL[a.action] ?? a.action}</span>
                  <div className="text-[11px] text-faint">{timeAgo(a.createdAt)}</div>
                </li>
              ))}
              {d.activity.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted">No activity yet.</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
