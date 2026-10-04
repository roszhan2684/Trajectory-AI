import { ROLE_LABELS } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { listTeam } from "@/server/services/org";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { InviteForm, MemberRoleSelect } from "@/components/settings/forms";
import { SettingsNav } from "@/components/settings/settings-nav";
import { initials, timeAgo } from "@/lib/utils";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const actor = await requireActor();
  const { members, invitations } = listTeam(actor);
  const canInvite = actor.caps.includes("members.invite");
  return (
    <>
      <PageHeader title="Settings" description="People in this organization and what they can do." />
      <SettingsNav active="team" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader
            title={`Members · ${members.length}`}
            description="Users can belong to multiple organizations with different roles."
          />
          <ul className="divide-y divide-line">
            {members.map(({ member, user }) => (
              <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="grid size-8 place-items-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: user.avatarColor }}
                >
                  {initials(user.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">
                    {user.displayName} {user.id === actor.user.id && <Badge tone="outline">you</Badge>}
                  </span>
                  <span className="text-xs text-muted">
                    {user.email} · joined {timeAgo(member.joinedAt)}
                  </span>
                </span>
                {canInvite ? (
                  <MemberRoleSelect
                    memberId={member.id}
                    role={member.role}
                    disabled={user.id === actor.user.id}
                  />
                ) : (
                  <Badge tone="neutral">{ROLE_LABELS[member.role]}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Invite a teammate" />
            {canInvite ? (
              <InviteForm />
            ) : (
              <p className="p-4 text-[13px] text-muted">Only owners and admins can invite members.</p>
            )}
          </Panel>
          <Panel>
            <PanelHeader title={`Pending invitations · ${invitations.length}`} />
            <ul className="divide-y divide-line text-[13px]">
              {invitations.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-ink-2">{i.email ?? "Anyone with the link"}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone="neutral">{ROLE_LABELS[i.role]}</Badge>
                    <span className="text-[11px] text-faint">
                      expires {timeAgo(i.expiresAt).replace(" ago", "")}
                    </span>
                  </span>
                </li>
              ))}
              {invitations.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted">None.</li>
              )}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
