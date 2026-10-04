import Link from "next/link";
import { ROLE_LABELS } from "@trajectory/engine";
import { ready } from "@/server/bootstrap";
import { getDB } from "@/server/db/store";
import { Logo } from "@/components/shell/logo";
import { InviteForm } from "@/components/auth/forms";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  await ready();
  const { token } = await params;
  const db = getDB();
  const inv = db.invitations.find(
    (i) => i.token === token && !i.acceptedByUserId && new Date(i.expiresAt) > new Date(),
  );
  const org = inv && db.organizations.find((o) => o.id === inv.organizationId);
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6">
      <div className="w-full max-w-sm">
        <Link href="/">
          <Logo />
        </Link>
        {inv && org ? (
          <>
            <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">Join {org.name}</h1>
            <p className="mt-1 text-[13px] text-muted">You've been invited as {ROLE_LABELS[inv.role]}.</p>
            <div className="mt-6 rounded-2xl border border-line bg-panel p-5 shadow-panel">
              <InviteForm token={token} />
            </div>
          </>
        ) : (
          <p className="mt-8 text-sm text-muted">This invitation is invalid, expired or already used.</p>
        )}
      </div>
    </div>
  );
}
