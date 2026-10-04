import Link from "next/link";
import { notFound } from "next/navigation";
import { DomainError, groupSkillRequirements } from "@trajectory/engine";
import { ArrowLeft } from "lucide-react";
import { ready } from "@/server/bootstrap";
import { portalContext } from "@/server/services/conversations";
import { money } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({
  params,
}: {
  params: Promise<{ token: string; matchId: string }>;
}) {
  await ready();
  const { token, matchId } = await params;
  let ctx;
  try {
    ctx = portalContext(token);
  } catch (e) {
    if (e instanceof DomainError) notFound();
    throw e;
  }
  const { match, role, org, requirements } = ctx;
  if (!match || match.id !== matchId || !role) notFound(); // the token only unlocks its own opportunity
  const groups = groupSkillRequirements(requirements);
  return (
    <div className="space-y-6">
      <Link
        href={`/candidate/${token}`}
        className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Back
      </Link>
      <section className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
        <p className="text-[13px] text-muted">{org.name}</p>
        <h1 className="mt-1 font-serif text-3xl italic text-ink">{role.title}</h1>
        <p className="mt-2 text-[13px] text-muted">
          {role.locationMode.toLowerCase()} {role.city ? `· ${role.city}` : ""} · {role.companyStage}{" "}
          {role.teamSize ? `· team of ${role.teamSize}` : ""}{" "}
          {role.maxComp ? `· ${money(role.minComp)}–${money(role.maxComp)} base` : ""} · visa sponsorship:{" "}
          {role.visaSupport.toLowerCase()}
        </p>
        <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-2">
          {role.descriptionNormalized}
        </p>
      </section>
      <section className="rounded-2xl border border-line bg-panel p-6 shadow-panel">
        <h2 className="text-[15px] font-semibold text-ink">What the team is looking for</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {(["MUST", "STRONG", "NICE"] as const).map((imp) => (
            <div key={imp}>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">
                {imp === "MUST" ? "Must have" : imp === "STRONG" ? "Strong signal" : "Nice to have"}
              </div>
              <ul className="space-y-1 text-[13px] text-ink-2">
                {groups
                  .filter((g) => g.req.importance === imp)
                  .map((g) => (
                    <li key={g.req.normalizedKey}>{g.req.label}</li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          About {org.name}: {org.description}
        </p>
      </section>
    </div>
  );
}
