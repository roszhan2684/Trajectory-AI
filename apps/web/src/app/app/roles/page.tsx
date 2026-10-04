import Link from "next/link";
import { Briefcase, Plus } from "lucide-react";
import type { RoleStatus } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { listRoles } from "@/server/services/roles";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { ScoreRing } from "@/components/domain/score";
import { cn, money, timeAgo } from "@/lib/utils";

export const metadata = { title: "Roles" };

const STATUS_TONE: Record<RoleStatus, Tone> = {
  ACTIVE: "good",
  DRAFT: "warn",
  PAUSED: "unknown",
  CLOSED: "outline",
};

export default async function RolesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await requireActor();
  const { status } = await searchParams;
  const all = listRoles(actor);
  const rows = status ? all.filter((r) => r.role.status === status) : all;
  const counts = Object.fromEntries(
    (["ACTIVE", "DRAFT", "PAUSED", "CLOSED"] as RoleStatus[]).map((s) => [
      s,
      all.filter((r) => r.role.status === s).length,
    ]),
  );
  const canEdit = actor.caps.includes("roles.edit");
  return (
    <>
      <PageHeader
        title="Roles"
        description="Each role is parsed into structured requirements, then ranked against the whole candidate pool."
        actions={
          canEdit && (
            <Button variant="primary" asChild>
              <Link href="/app/roles/new">
                <Plus /> New role
              </Link>
            </Button>
          )
        }
      />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {[
          ["", `All ${all.length}`],
          ...(["ACTIVE", "DRAFT", "PAUSED", "CLOSED"] as const).map((s) => [
            s,
            `${s[0]}${s.slice(1).toLowerCase()} ${counts[s]}`,
          ]),
        ].map(([s, label]) => (
          <Link
            key={s}
            href={s ? `/app/roles?status=${s}` : "/app/roles"}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium",
              (status ?? "") === s ? "bg-ink text-bg" : "text-muted hover:bg-subtle hover:text-ink",
            )}
          >
            {label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<Briefcase />}
          title="No roles here yet"
          action={
            canEdit && (
              <Button variant="primary" asChild>
                <Link href="/app/roles/new">Describe a role</Link>
              </Button>
            )
          }
        >
          Paste a messy hiring brief and Trajectory turns it into editable, structured requirements.
        </EmptyState>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Location</th>
                <th className="px-3 py-2.5 font-medium">Comp</th>
                <th className="px-3 py-2.5 text-right font-medium">Ranked</th>
                <th className="px-3 py-2.5 font-medium">Top match</th>
                <th className="px-3 py-2.5 font-medium">Pipeline</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.role.id} className="group transition hover:bg-panel-2">
                  <td className="px-4 py-3">
                    <Link
                      href={
                        r.role.status === "DRAFT"
                          ? `/app/roles/${r.role.id}`
                          : `/app/roles/${r.role.id}/matches`
                      }
                      className="font-medium text-ink group-hover:text-accent"
                    >
                      {r.role.title}
                    </Link>
                    <div className="text-xs text-muted">
                      {r.requirements} requirements · created {timeAgo(r.role.createdAt)}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={STATUS_TONE[r.role.status]} dot>
                      {r.role.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-ink-2">
                    {r.role.city ?? "Remote"}{" "}
                    <span className="text-muted">· {r.role.locationMode.toLowerCase()}</span>
                  </td>
                  <td className="tabular px-3 py-3 text-ink-2">
                    {r.role.maxComp ? (
                      `${money(r.role.minComp)}–${money(r.role.maxComp)}`
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="tabular px-3 py-3 text-right text-ink-2">{r.matches || "—"}</td>
                  <td className="px-3 py-3">
                    {r.topScore !== null ? (
                      <ScoreRing value={r.topScore} size={30} stroke={3} />
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      {r.shortlisted > 0 && <Badge tone="accent">{r.shortlisted} shortlisted</Badge>}
                      {r.qualifying > 0 && <Badge tone="info">{r.qualifying} qualifying</Badge>}
                      {r.intros > 0 && <Badge tone="warn">{r.intros} intro</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{r.creator?.displayName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
