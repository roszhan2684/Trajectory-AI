import { notFound } from "next/navigation";
import { DomainError } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { getCandidate } from "@/server/services/candidates";
import { CandidateProfile } from "@/components/candidates/candidate-profile";
import Link from "next/link";

export default async function CandidatePage({ params }: { params: Promise<{ candidateId: string }> }) {
  const actor = await requireActor();
  const { candidateId } = await params;
  let d;
  try {
    d = getCandidate(actor, candidateId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted">
        <Link href="/app/candidates" className="hover:text-ink">
          Candidates
        </Link>{" "}
        / <span className="text-ink-2">{d.candidate.fullName}</span>
      </nav>
      <div>
        <CandidateProfile
          candidate={d.candidate}
          matches={d.matches}
          indexState={d.indexState}
          conversations={d.conversations}
          canIngest={actor.caps.includes("candidates.ingest")}
          canDelete={actor.caps.includes("org.manage")}
        />
      </div>
    </>
  );
}
