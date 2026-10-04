import { SKILLS } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { requireCap } from "@/server/services/core";
import { getRole } from "@/server/services/roles";
import { PageHeader } from "@/components/page-header";
import { RoleEditor } from "@/components/roles/role-editor";
import type { RoleDraftInput } from "@/server/validation";

export default async function EditRolePage({ params }: { params: Promise<{ roleId: string }> }) {
  const actor = await requireActor();
  requireCap(actor, "roles.edit");
  const { roleId } = await params;
  const { role, requirements } = getRole(actor, roleId);
  const draft: RoleDraftInput = {
    title: role.title,
    descriptionRaw: role.descriptionRaw,
    locationMode: role.locationMode,
    city: role.city,
    region: role.region,
    countryCode: role.countryCode,
    minComp: role.minComp,
    maxComp: role.maxComp,
    currency: role.currency,
    visaSupport: role.visaSupport,
    employmentType: role.employmentType,
    minYears: role.minYears,
    maxYears: role.maxYears,
    companyStage: role.companyStage,
    teamSize: role.teamSize,
    domain: role.domain,
    responsibilities: role.responsibilities,
    requirements: requirements.map((r) => ({
      category: r.category,
      label: r.label,
      normalizedKey: r.normalizedKey,
      importance: r.importance,
      isHardConstraint: r.isHardConstraint,
      sourceText: r.sourceText,
      confidence: r.confidence,
    })),
    parse: role.parse,
  };
  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Roles", href: "/app/roles" },
          { label: role.title, href: `/app/roles/${role.id}` },
          { label: "Edit" },
        ]}
        title={`Edit · ${role.title}`}
      />
      <RoleEditor
        initial={draft}
        mode="edit"
        roleId={role.id}
        skills={SKILLS.map((s) => ({ key: s.key, display: s.display, category: s.category }))}
      />
    </>
  );
}
