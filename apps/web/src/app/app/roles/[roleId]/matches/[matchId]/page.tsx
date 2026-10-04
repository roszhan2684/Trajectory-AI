import { notFound } from "next/navigation";
import { DEFAULT_RANKING, DomainError } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { getMatchDetail } from "@/server/services/matches";
import { getDB } from "@/server/db/store";
import { MatchDetail } from "@/components/matches/match-detail";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ roleId: string; matchId: string }>;
}) {
  const actor = await requireActor();
  const { matchId } = await params;
  let d;
  try {
    d = getMatchDetail(actor, matchId);
  } catch (e) {
    if (e instanceof DomainError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const users = new Map(getDB().users.map((u) => [u.id, u.displayName]));
  return (
    <MatchDetail
      match={d.match}
      candidate={d.candidate}
      role={d.role}
      requirements={d.requirements}
      trajectory={d.trajectory}
      conversation={d.conversation}
      intro={d.intro}
      feedback={d.feedback}
      activity={d.activity.map((a) => ({ ...a, actor: users.get(a.actorUserId ?? "") ?? "System" }))}
      prevId={d.prevId}
      nextId={d.nextId}
      caps={actor.caps}
      blend={DEFAULT_RANKING.blend}
    />
  );
}

export async function generateMetadata({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const db = getDB();
  const m = db.matches.find((x) => x.id === matchId);
  const c = m && db.candidates.find((x) => x.id === m.candidateId);
  return { title: c ? `${c.fullName} · match` : "Match" };
}
