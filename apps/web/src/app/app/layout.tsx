import { ROLE_LABELS } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { membershipsFor } from "@/server/services/org";
import { getDB } from "@/server/db/store";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const db = getDB();
  const roles = db.roles.filter((r) => r.organizationId === actor.org.id);
  const pendingIntros = db.introductions.filter(
    (i) =>
      i.organizationId === actor.org.id &&
      ["READY_FOR_APPROVAL", "AWAITING_CANDIDATE", "DRAFT", "APPROVED"].includes(i.status),
  ).length;
  return (
    <AppShell
      user={{
        id: actor.user.id,
        displayName: actor.user.displayName,
        email: actor.user.email,
        title: actor.user.title,
        avatarColor: actor.user.avatarColor,
      }}
      org={{ id: actor.org.id, name: actor.org.name }}
      roleLabel={ROLE_LABELS[actor.role]}
      memberships={membershipsFor(actor.user.id).map((m) => ({
        orgId: m.org.id,
        orgName: m.org.name,
        roleLabel: ROLE_LABELS[m.role],
      }))}
      caps={actor.caps}
      roles={roles.map((r) => ({ id: r.id, title: r.title, status: r.status }))}
      counts={{ intros: pendingIntros, roles: roles.filter((r) => r.status === "ACTIVE").length }}
    >
      {children}
    </AppShell>
  );
}
