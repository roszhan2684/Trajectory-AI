import { DomainError } from "@trajectory/engine";
import { ready } from "@/server/bootstrap";
import { portalContext } from "@/server/services/conversations";
import { PortalClient } from "@/components/portal/portal-client";
import { money } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your opportunity", robots: { index: false } };

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  await ready();
  const { token } = await params;
  let ctx;
  try {
    ctx = portalContext(token);
  } catch (e) {
    if (e instanceof DomainError) return <Expired />;
    throw e;
  }
  const { conv, match, candidate, role, org, intro } = ctx;
  return (
    <PortalClient
      token={token}
      orgName={org.name}
      firstName={candidate.fullName.split(" ")[0]!}
      role={
        role
          ? {
              title: role.title,
              where: `${role.locationMode.toLowerCase()}${role.city ? ` · ${role.city}` : ""}`,
              comp: role.maxComp ? `${money(role.minComp)}–${money(role.maxComp)} base` : null,
              stage: role.companyStage,
              team: role.teamSize ? `team of ${role.teamSize}` : null,
            }
          : null
      }
      matchId={match?.id ?? null}
      reasons={(match?.explanation?.whyMatch ?? [])
        .filter((w) => !w.text.startsWith("Fit model"))
        .slice(0, 3)
        .map((w) => w.text.replace(/^[^:]+:\s*/, ""))}
      messages={conv.messages}
      introAwaiting={intro?.status === "AWAITING_CANDIDATE"}
      introStatus={intro?.status ?? null}
      prefs={{
        workModes: candidate.preferences.workModes ?? [],
        openToRelocate: candidate.preferences.openToRelocate,
        wantsAiWork: candidate.preferences.wantsAiWork,
      }}
    />
  );
}

function Expired() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-8 text-center">
      <h1 className="text-lg font-semibold text-ink">This link is invalid or has expired</h1>
      <p className="mt-1 text-sm text-muted">
        Portal links are signed and time-limited. Ask the recruiter to send a fresh one.
      </p>
    </div>
  );
}
