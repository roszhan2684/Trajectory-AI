import { CAPABILITY_MATRIX, ROLE_LABELS, type MemberRole } from "@trajectory/engine";
import { Check, Minus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { OrgForm, ResetDemo } from "@/components/settings/forms";
import { SettingsNav } from "@/components/settings/settings-nav";

export const metadata = { title: "Organization" };

const CAPS: [string, string][] = [
  ["org.manage", "Manage organization"],
  ["members.invite", "Invite members"],
  ["roles.edit", "Create / edit roles"],
  ["candidates.search", "Search candidates"],
  ["ranking.refine", "Refine ranking"],
  ["intro.request", "Request intro"],
  ["intro.approve", "Approve / send intro"],
  ["evals.view", "View evals"],
  ["lab.view", "Lab & traces"],
];

export default async function OrgSettings() {
  const actor = await requireActor();
  const canManage = actor.caps.includes("org.manage");
  const roles: MemberRole[] = [
    "OWNER",
    "ADMIN",
    "RECRUITER",
    "HIRING_MANAGER",
    "VIEWER",
    "INTERNAL_OPERATOR",
  ];
  return (
    <>
      <PageHeader title="Settings" description="Organization profile, permissions and demo controls." />
      <SettingsNav active="organization" />
      <div className="space-y-6">
        <Panel>
          <PanelHeader
            title="Organization"
            description={`Tenant ${actor.org.slug} · every role, match, intro and audit event is scoped to this organization.`}
          />
          <OrgForm
            org={{
              name: actor.org.name,
              website: actor.org.website,
              industry: actor.org.industry,
              description: actor.org.description,
              hiringManagersCanApproveIntros: actor.org.hiringManagersCanApproveIntros,
            }}
            canManage={canManage}
          />
        </Panel>
        <Panel>
          <PanelHeader
            title="Role-based access"
            description="Enforced in the service layer on every action; the UI only hides what you can't do."
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-faint">
                  <th className="px-4 py-2 text-left font-medium">Capability</th>
                  {roles.map((r) => (
                    <th key={r} className={`px-2 py-2 font-medium ${r === actor.role ? "text-accent" : ""}`}>
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {CAPS.map(([cap, label]) => (
                  <tr key={cap}>
                    <td className="px-4 py-2 text-ink-2">{label}</td>
                    {roles.map((r) => {
                      const has =
                        (CAPABILITY_MATRIX[r] as string[]).includes(cap) ||
                        (cap === "intro.approve" &&
                          r === "HIRING_MANAGER" &&
                          actor.org.hiringManagersCanApproveIntros);
                      return (
                        <td key={r} className="px-2 py-2 text-center">
                          {has ? (
                            <Check className="mx-auto size-4 text-good" aria-label="yes" />
                          ) : (
                            <Minus className="mx-auto size-4 text-line-strong" aria-label="no" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        {canManage && (
          <Panel>
            <PanelHeader
              title="Demo controls"
              description="Rebuild the deterministic synthetic dataset (same seed → identical data). Disabled in production."
            />
            <div className="p-4">
              <ResetDemo />
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
