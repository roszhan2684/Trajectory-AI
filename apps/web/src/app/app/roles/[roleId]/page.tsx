import Link from "next/link";
import { Activity, ArrowRight, CircleHelp, History, Lock, Pencil, SlidersHorizontal } from "lucide-react";
import { PREFERENCE_BY_KEY, groupSkillRequirements } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { getRole } from "@/server/services/roles";
import { getDB } from "@/server/db/store";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RoleActions } from "@/components/roles/role-actions";
import { RevertButton } from "@/components/roles/revert-button";
import { money, timeAgo } from "@/lib/utils";

export default async function RolePage({ params }: { params: Promise<{ roleId: string }> }) {
  const actor = await requireActor();
  const { roleId } = await params;
  const { role, requirements, preferences, refinements, runs } = getRole(actor, roleId);
  const db = getDB();
  const users = new Map(db.users.map((u) => [u.id, u.displayName]));
  const groups = groupSkillRequirements(requirements);
  const other = requirements.filter((r) => r.category !== "SKILL");
  const canEdit = actor.caps.includes("roles.edit");
  const active = preferences.filter((p) => p.active);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Roles", href: "/app/roles" }, { label: role.title }]}
        eyebrow={
          <div className="flex items-center gap-2">
            <Badge
              tone={role.status === "ACTIVE" ? "good" : role.status === "DRAFT" ? "warn" : "unknown"}
              dot
            >
              {role.status.toLowerCase()}
            </Badge>
            <span className="text-xs text-muted">
              created by {users.get(role.createdByUserId)} · {timeAgo(role.createdAt)}
            </span>
          </div>
        }
        title={role.title}
        description={`${role.locationMode.toLowerCase()}${role.city ? ` · ${role.city}` : ""} · ${role.maxComp ? `${money(role.minComp)}–${money(role.maxComp)}` : "comp not set"} · visa: ${role.visaSupport.toLowerCase()} · ${role.minYears ?? "?"}${role.maxYears ? `–${role.maxYears}` : "+"} yrs · ${role.companyStage}${role.teamSize ? ` · team of ${role.teamSize}` : ""}`}
        actions={
          <>
            {canEdit && (
              <Button asChild>
                <Link href={`/app/roles/${role.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            <RoleActions roleId={role.id} status={role.status} canEdit={canEdit} />
            {role.status !== "DRAFT" && (
              <Button variant="primary" asChild>
                <Link href={`/app/roles/${role.id}/matches`}>
                  View matches <ArrowRight />
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader
              title="Skill requirements"
              description="Alternatives (e.g. Typesense or Elasticsearch) are grouped into one requirement satisfied by the best evidence."
            />
            <div className="grid gap-px bg-line sm:grid-cols-3">
              {(["MUST", "STRONG", "NICE"] as const).map((imp) => (
                <div key={imp} className="bg-panel p-4">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-faint">
                    {imp === "MUST" ? "Must have" : imp === "STRONG" ? "Strong signal" : "Nice to have"}
                  </div>
                  <ul className="space-y-1.5">
                    {groups
                      .filter((g) => g.req.importance === imp)
                      .map((g) => (
                        <li key={g.req.normalizedKey} className="text-[13px] text-ink">
                          {g.req.label}
                          {g.req.isHardConstraint && <Lock className="ml-1 inline size-3 text-muted" />}
                        </li>
                      ))}
                    {!groups.some((g) => g.req.importance === imp) && (
                      <li className="text-xs text-faint">—</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Experience, work style & constraints" />
            <ul className="divide-y divide-line">
              {other.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                  <Badge tone={r.isHardConstraint ? "bad" : "outline"}>
                    {r.isHardConstraint ? "hard constraint" : r.category.toLowerCase().replace("_", " ")}
                  </Badge>
                  <span className="flex-1 text-ink">{r.label}</span>
                  <Badge tone={r.importance === "MUST" ? "accent" : "neutral"}>
                    {r.importance.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          </Panel>
          {role.parse && role.parse.ambiguities.length > 0 && (
            <Panel>
              <PanelHeader
                icon={<CircleHelp className="size-3.5 text-muted" />}
                title="Open questions from the brief"
                description="Unresolved ambiguity lowers match confidence."
              />
              <ul className="divide-y divide-line">
                {role.parse.ambiguities.map((a) => (
                  <li key={a.question} className="flex items-start gap-2 px-4 py-2.5 text-[13px] text-ink-2">
                    <Badge
                      tone={a.severity === "high" ? "bad" : a.severity === "medium" ? "warn" : "unknown"}
                    >
                      {a.severity}
                    </Badge>
                    {a.question}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel>
            <PanelHeader
              title="Original brief"
              description={`Parsed by ${role.parse?.parserVersion ?? "manual entry"}`}
            />
            <p className="whitespace-pre-wrap px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              {role.descriptionRaw || "—"}
            </p>
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel>
            <PanelHeader
              icon={<SlidersHorizontal className="size-3.5 text-muted" />}
              title="Learned preferences"
              description="Allowlisted ranking adjustments confirmed by your team."
            />
            <ul className="divide-y divide-line">
              {active.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span className="text-ink-2">{PREFERENCE_BY_KEY[p.key]?.label ?? p.key}</span>
                  <span className={`tabular font-medium ${p.weightDelta > 0 ? "text-good" : "text-bad"}`}>
                    {p.weightDelta > 0 ? "+" : ""}
                    {p.weightDelta.toFixed(2)}
                  </span>
                </li>
              ))}
              {active.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted">
                  None yet — refine the ranking from the matches page.
                </li>
              )}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader
              icon={<History className="size-3.5 text-muted" />}
              title="Refinement history"
              description="Every change is auditable and reversible."
            />
            <ul className="divide-y divide-line">
              {refinements.map((r) => (
                <li key={r.id} className="px-4 py-3 text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      tone={
                        r.status === "APPLIED"
                          ? "good"
                          : r.status === "REVERTED"
                            ? "unknown"
                            : r.status === "PROPOSED"
                              ? "warn"
                              : "outline"
                      }
                    >
                      {r.status.toLowerCase()}
                    </Badge>
                    <span className="text-[11px] text-faint">
                      {users.get(r.createdByUserId)} · {timeAgo(r.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-ink-2">
                    “{db.feedback.find((f) => f.id === r.feedbackId)?.freeText}”
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {r.proposals.map((p) => (
                      <Badge key={p.key} tone={p.delta > 0 ? "good" : "bad"}>
                        {p.label} {p.delta > 0 ? "+" : ""}
                        {p.delta}
                      </Badge>
                    ))}
                  </div>
                  {r.status === "APPLIED" && canEdit && <RevertButton refinementId={r.id} />}
                </li>
              ))}
              {refinements.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted">No refinements yet.</li>
              )}
            </ul>
          </Panel>
          <Panel>
            <PanelHeader icon={<Activity className="size-3.5 text-muted" />} title="Ranking runs" />
            <ul className="divide-y divide-line">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-ink-2">
                    {r.trigger} · {r.ranked} ranked · {r.filtered} filtered
                  </span>
                  <span className="flex items-center gap-2 text-faint">
                    {timeAgo(r.completedAt)}
                    {r.traceId && actor.caps.includes("lab.view") && (
                      <Link href={`/app/lab/traces?id=${r.traceId}`} className="text-accent hover:underline">
                        trace
                      </Link>
                    )}
                  </span>
                </li>
              ))}
              {runs.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted">
                  Not ranked yet — activate the role.
                </li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
