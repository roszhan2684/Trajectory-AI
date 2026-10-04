import { apiActor, handle } from "@/server/http";
import { listMatches } from "@/server/services/matches";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const actor = await apiActor(req);
    const limit = Math.min(50, Number(new URL(req.url).searchParams.get("limit") ?? 15));
    const { role, ranked, filtered, lastRun } = listMatches(actor, id);
    return {
      role: { id: role.id, title: role.title },
      lastRun: lastRun && {
        at: lastRun.completedAt,
        scoreVersion: lastRun.scoreVersion,
        retrieved: lastRun.retrieved,
      },
      matches: ranked.slice(0, limit).map(({ match: m, candidate: c }) => ({
        matchId: m.id,
        rank: m.rank,
        candidate: c.fullName,
        headline: c.headline,
        score: Math.round(m.finalScore * 1000) / 10,
        confidence: Math.round(m.confidenceScore * 100),
        hardConstraints: m.hardConstraintStatus,
        status: m.status,
        topSignals: m.explanation?.whyMatch.slice(0, 3).map((w) => w.text) ?? [],
        openQuestions: m.uncertainties.slice(0, 2).map((u) => u.description),
      })),
      filteredOut: filtered.length,
    };
  });
}
