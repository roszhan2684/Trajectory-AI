import { SKILLS } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { requireCap } from "@/server/services/core";
import { PageHeader } from "@/components/page-header";
import { RoleEditor } from "@/components/roles/role-editor";

export const metadata = { title: "New role" };

export default async function NewRolePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const actor = await requireActor();
  requireCap(actor, "roles.edit");
  const { welcome } = await searchParams;
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Roles", href: "/app/roles" }, { label: "New role" }]}
        title={welcome ? `Welcome to ${actor.org.name} — describe your first role` : "Create a role"}
        description="Paste a brief in plain language. Trajectory proposes structured requirements, hard constraints and open questions — you review everything before it goes live."
      />
      <RoleEditor
        initial={null}
        mode="create"
        skills={SKILLS.map((s) => ({ key: s.key, display: s.display, category: s.category }))}
      />
    </>
  );
}
